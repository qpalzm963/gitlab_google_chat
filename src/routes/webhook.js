const express = require('express')
const crypto = require('crypto')
const repo = require('../repositories')
const { buildPayloadHash, sha256 } = require('../utils/hash')
const { buildCard } = require('../utils/chatCard')
const { sendCard, updateCard } = require('../utils/chatSend')
const { getMrSummary } = require('../utils/aiSummary')

const router = express.Router()

const PLATFORM_GITLAB = 'gitlab'
const PLATFORM_GITHUB = 'github'

// ── GitLab ────────────────────────────────────────────────────────────────
const GITLAB_SUPPORTED_EVENTS = new Set(['Merge Request Hook'])
const GITLAB_EVENT_TYPE_MAP = {
  'Merge Request Hook': 'merge_request',
  'Push Hook': 'push',
  'Note Hook': 'note'
}

// ── GitHub ────────────────────────────────────────────────────────────────
const GITHUB_SUPPORTED_EVENTS = new Set(['pull_request'])

router.post('/', async (req, res) => {
  const deptId = req.query.dept
  if (!deptId) return res.status(400).json({ error: 'Missing dept parameter' })

  const dept = await repo.dept.findById(deptId, { decrypt: true })
  if (!dept || !dept.is_active) {
    return res.status(400).json({ error: 'Department not found or inactive' })
  }

  const platform = dept.platform || PLATFORM_GITLAB
  const gitlabEvent = req.headers['x-gitlab-event']
  const ghEvent = req.headers['x-github-event']
  const action = req.body?.object_attributes?.action || req.body?.action || null
  console.log('[webhook] dept=%s platform=%s gitlabEvent=%s ghEvent=%s action=%s',
    deptId, platform, gitlabEvent || '-', ghEvent || '-', action || '-')

  if (platform === PLATFORM_GITHUB) {
    return handleGithubWebhook(req, res, dept)
  }

  return handleGitlabWebhook(req, res, dept)
})

async function handleGitlabWebhook(req, res, dept) {
  const gitlabEvent = req.headers['x-gitlab-event']
  const eventUUID = req.headers['x-gitlab-event-uuid']
  const receivedToken = req.headers['x-gitlab-token']

  // 1. 僅處理 Merge Request Hook
  if (!GITLAB_SUPPORTED_EVENTS.has(gitlabEvent)) {
    console.log('[webhook][gitlab] ignored event=%s', gitlabEvent || '(missing)')
    return res.status(200).json({ message: 'Event type not handled' })
  }

  // 2. 選填 project_id 驗證
  const payloadProjectId = String(req.body?.project?.id || '')
  if (dept.gitlab_project_id && payloadProjectId && payloadProjectId !== dept.gitlab_project_id) {
    return res.status(400).json({ error: 'Project ID mismatch' })
  }

  // 3. 驗證 X-Gitlab-Token
  if (!receivedToken || !verifyConstantTime(receivedToken, dept.webhook_secret)) {
    console.log('[webhook][gitlab] unauthorized: token mismatch')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const payload = req.body
  const eventType = GITLAB_EVENT_TYPE_MAP[gitlabEvent] || 'unknown'
  const eventAction = payload?.object_attributes?.action || null
  const mrIid = payload?.object_attributes?.iid || null

  // 4. 去重
  const hash = buildPayloadHash(eventUUID || JSON.stringify(payload), dept.id)
  if (await repo.log.findByHash(hash)) {
    return res.status(200).json({ message: 'duplicate' })
  }

  // 5. 判斷觸發開關
  if (!shouldNotify(dept, eventAction)) {
    console.log('[webhook][gitlab] filtered action=%s', eventAction || '(none)')
    return res.status(200).json({ message: 'Event filtered by settings' })
  }

  // 6. 送 Google Chat Card（或更新既有卡片）
  const summary = (dept.ev_ai_summary && NEW_CARD_ACTIONS.has(eventAction))
    ? await getMrSummary(dept, payload, PLATFORM_GITLAB)
    : null
  const card = buildCard(dept, payload, { summary })
  let chatResponseCode = null
  let errorMessage = null
  let status = 'sent'
  let chatMessageName = null

  try {
    // reopen/opened：強制發新卡片；其他事件嘗試原地更新既有卡片
    const existingLog = (eventAction && !NEW_CARD_ACTIONS.has(eventAction) && mrIid)
      ? await repo.log.findLatestSentByDeptAndMr(dept.id, mrIid)
      : null
    const existingMessageName = existingLog?.chat_message_name || null

    let result
    if (existingMessageName) {
      const res = await updateCard(existingMessageName, card)
      const bodyText = await res.text()
      const bodyJson = tryParseJson(bodyText)
      result = { response: res, transport: 'chat_api_update', bodyText, bodyJson }
      chatMessageName = existingMessageName
    } else {
      result = await sendCard(dept.space_name, dept.chat_webhook_url, card)
      chatMessageName = result.bodyJson?.name || null
    }

    chatResponseCode = result.response.status
    if (!result.response.ok) {
      throw new Error(`HTTP ${result.response.status}: ${result.bodyText}`)
    }
    console.log(
      '[webhook][gitlab] sent transport=%s space=%s message=%s status=%s',
      result.transport,
      dept.space_name || '(webhook-only)',
      chatMessageName || '(unknown)',
      result.response.status
    )
  } catch (err) {
    status = 'failed'
    errorMessage = err.message
  }

  // 7. 寫 log
  await repo.log.create({
    departmentId: dept.id, eventType, eventAction,
    gitlabMrIid: mrIid, payloadHash: hash,
    status, chatResponseCode, errorMessage, chatMessageName
  })

  if (status !== 'sent') console.log('[webhook][gitlab] send failed: %s', errorMessage || '(unknown)')
  return res.status(200).json({ message: status })
}

async function handleGithubWebhook(req, res, dept) {
  const ghEvent = req.headers['x-github-event']
  const delivery = req.headers['x-github-delivery']
  const signature = req.headers['x-hub-signature-256']
  const contentType = req.headers['content-type']

  // 1. 僅處理 pull_request events
  if (!GITHUB_SUPPORTED_EVENTS.has(ghEvent)) {
    console.log('[webhook][github] ignored event=%s delivery=%s', ghEvent || '(missing)', delivery || '(missing)')
    return res.status(200).json({ message: 'Event type not handled' })
  }

  // 2. 驗證 signature（HMAC-SHA256 over raw bytes）
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8')
  if (!verifyGithubSignature(raw, dept.webhook_secret, signature)) {
    console.log('[webhook][github] unauthorized: signature mismatch delivery=%s', delivery || '(missing)')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let payload = req.body || {}
  // If GitHub sends `application/x-www-form-urlencoded`, the JSON payload is in `payload`.
  if (payload && typeof payload.payload === 'string') {
    try {
      payload = JSON.parse(payload.payload)
    } catch (err) {
      console.log('[webhook][github] invalid form payload json: %s', err.message)
      return res.status(400).json({ error: 'Invalid payload' })
    }
  }
  const repoFullName = payload?.repository?.full_name
  if (dept.github_owner && dept.github_repo && repoFullName) {
    const expected = `${dept.github_owner}/${dept.github_repo}`
    if (repoFullName !== expected) return res.status(400).json({ error: 'Repository mismatch' })
  }

  const eventType = 'pull_request'
  const rawAction = payload?.action || null
  const pr = payload?.pull_request || {}
  const prNumber = pr.number || null

  // normalize actions to reuse existing switches
  const eventAction = normalizeGithubPrAction(rawAction, pr)
  console.log(
    '[webhook][github] delivery=%s contentType=%s action=%s rawAction=%s repo=%s pr=%s',
    delivery || '(missing)',
    contentType || '(missing)',
    eventAction || '(missing)',
    rawAction || '(missing)',
    repoFullName || '(missing)',
    prNumber || '(missing)'
  )

  // 3. 去重（優先用 X-GitHub-Delivery）
  const dedupeKey = delivery || sha256(raw.toString('utf8'))
  const hash = buildPayloadHash(dedupeKey, dept.id)
  if (await repo.log.findByHash(hash)) {
    return res.status(200).json({ message: 'duplicate' })
  }

  // 4. 判斷觸發開關
  if (!shouldNotify(dept, eventAction)) {
    console.log('[webhook][github] filtered action=%s delivery=%s', eventAction || '(none)', delivery || '(missing)')
    return res.status(200).json({ message: 'Event filtered by settings' })
  }

  // 5. 送 Google Chat Card（或更新既有卡片）
  const summary = (dept.ev_ai_summary && NEW_CARD_ACTIONS.has(eventAction))
    ? await getMrSummary(dept, payload, PLATFORM_GITHUB)
    : null
  const card = buildCard(dept, payload, { summary })
  let chatResponseCode = null
  let errorMessage = null
  let status = 'sent'
  let chatMessageName = null

  try {
    const existingLog = (eventAction && !NEW_CARD_ACTIONS.has(eventAction) && prNumber)
      ? await repo.log.findLatestSentByDeptAndMr(dept.id, prNumber)
      : null
    const existingMessageName = existingLog?.chat_message_name || null

    let result
    if (existingMessageName) {
      const res = await updateCard(existingMessageName, card)
      const bodyText = await res.text()
      const bodyJson = tryParseJson(bodyText)
      result = { response: res, transport: 'chat_api_update', bodyText, bodyJson }
      chatMessageName = existingMessageName
    } else {
      result = await sendCard(dept.space_name, dept.chat_webhook_url, card)
      chatMessageName = result.bodyJson?.name || null
    }

    chatResponseCode = result.response.status
    if (!result.response.ok) {
      throw new Error(`HTTP ${result.response.status}: ${result.bodyText}`)
    }
    console.log(
      '[webhook][github] sent transport=%s space=%s message=%s status=%s',
      result.transport,
      dept.space_name || '(webhook-only)',
      chatMessageName || '(unknown)',
      result.response.status
    )
  } catch (err) {
    status = 'failed'
    errorMessage = err.message
  }

  await repo.log.create({
    departmentId: dept.id, eventType, eventAction,
    gitlabMrIid: prNumber, payloadHash: hash,
    status, chatResponseCode, errorMessage, chatMessageName
  })

  if (status !== 'sent') console.log('[webhook][github] send failed: %s', errorMessage || '(unknown)')
  return res.status(200).json({ message: status })
}

function verifyConstantTime(received, stored) {
  try {
    const a = Buffer.from(received)
    const b = Buffer.from(stored)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function verifyGithubSignature(rawBody, secret, headerSignature) {
  if (!secret || !headerSignature) return false
  if (!headerSignature.startsWith('sha256=')) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
  return verifyConstantTime(expected, headerSignature)
}

function normalizeGithubPrAction(action, pr) {
  if (action === 'opened') return 'opened'
  if (action === 'synchronize') return 'updated'
  if (action === 'closed') return pr?.merged ? 'merged' : 'closed'
  return action
}

function shouldNotify(dept, action) {
  if (action === 'open' || action === 'opened' || action === 'reopen') return dept.ev_mr_opened
  if (action === 'update' || action === 'updated') return dept.ev_mr_updated
  if (action === 'merge' || action === 'merged') return dept.ev_mr_merged
  return true
}

// Actions that should always send a new card (not update an existing one)
const NEW_CARD_ACTIONS = new Set(['opened', 'open', 'reopen'])

function tryParseJson(value) {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

module.exports = router
