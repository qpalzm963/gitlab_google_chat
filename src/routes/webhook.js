const express = require('express')
const crypto = require('crypto')
const repo = require('../repositories')
const { buildPayloadHash, sha256 } = require('../utils/hash')
const { buildCard } = require('../utils/chatCard')

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
    return res.status(200).json({ message: 'Event type not handled' })
  }

  // 2. 選填 project_id 驗證
  const payloadProjectId = String(req.body?.project?.id || '')
  if (dept.gitlab_project_id && payloadProjectId && payloadProjectId !== dept.gitlab_project_id) {
    return res.status(400).json({ error: 'Project ID mismatch' })
  }

  // 3. 驗證 X-Gitlab-Token
  if (!receivedToken || !verifyConstantTime(receivedToken, dept.webhook_secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const payload = req.body
  const eventType = GITLAB_EVENT_TYPE_MAP[gitlabEvent] || 'unknown'
  const eventAction = payload?.object_attributes?.action || null
  const mrIid = payload?.object_attributes?.iid || null

  // 4. 去重
  const hash = buildPayloadHash(eventUUID || JSON.stringify(payload), dept.id)
  if (await repo.log.findByHash(hash)) {
    await repo.log.create({
      departmentId: dept.id, eventType, eventAction,
      gitlabMrIid: mrIid, payloadHash: hash, status: 'duplicate'
    })
    return res.status(200).json({ message: 'duplicate' })
  }

  // 5. 判斷觸發開關
  if (!shouldNotify(dept, eventAction)) {
    return res.status(200).json({ message: 'Event filtered by settings' })
  }

  // 6. 送 Google Chat Card
  const card = buildCard(dept, payload)
  let chatResponseCode = null
  let errorMessage = null
  let status = 'sent'

  try {
    const response = await sendWithRetry(dept.chat_webhook_url, card)
    chatResponseCode = response.status
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`HTTP ${response.status}: ${body}`)
    }
  } catch (err) {
    status = 'failed'
    errorMessage = err.message
  }

  // 7. 寫 log
  await repo.log.create({
    departmentId: dept.id, eventType, eventAction,
    gitlabMrIid: mrIid, payloadHash: hash,
    status, chatResponseCode, errorMessage
  })

  return res.status(200).json({ message: status })
}

async function handleGithubWebhook(req, res, dept) {
  const ghEvent = req.headers['x-github-event']
  const delivery = req.headers['x-github-delivery']
  const signature = req.headers['x-hub-signature-256']

  // 1. 僅處理 pull_request events
  if (!GITHUB_SUPPORTED_EVENTS.has(ghEvent)) {
    return res.status(200).json({ message: 'Event type not handled' })
  }

  // 2. 驗證 signature（HMAC-SHA256 over raw bytes）
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8')
  if (!verifyGithubSignature(raw, dept.webhook_secret, signature)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const payload = req.body || {}
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

  // 3. 去重（優先用 X-GitHub-Delivery）
  const dedupeKey = delivery || sha256(raw.toString('utf8'))
  const hash = buildPayloadHash(dedupeKey, dept.id)
  if (await repo.log.findByHash(hash)) {
    await repo.log.create({
      departmentId: dept.id, eventType, eventAction,
      gitlabMrIid: prNumber, payloadHash: hash, status: 'duplicate'
    })
    return res.status(200).json({ message: 'duplicate' })
  }

  // 4. 判斷觸發開關
  if (!shouldNotify(dept, eventAction)) {
    return res.status(200).json({ message: 'Event filtered by settings' })
  }

  // 5. 送 Google Chat Card
  const card = buildCard(dept, payload)
  let chatResponseCode = null
  let errorMessage = null
  let status = 'sent'

  try {
    const response = await sendWithRetry(dept.chat_webhook_url, card)
    chatResponseCode = response.status
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`HTTP ${response.status}: ${body}`)
    }
  } catch (err) {
    status = 'failed'
    errorMessage = err.message
  }

  await repo.log.create({
    departmentId: dept.id, eventType, eventAction,
    gitlabMrIid: prNumber, payloadHash: hash,
    status, chatResponseCode, errorMessage
  })

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
  if (action === 'open' || action === 'opened') return dept.ev_mr_opened
  if (action === 'update' || action === 'updated') return dept.ev_mr_updated
  if (action === 'merge' || action === 'merged') return dept.ev_mr_merged
  return true
}

async function sendWithRetry(url, body, maxRetries = 3) {
  let lastErr
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      return res
    } catch (err) {
      lastErr = err
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
      }
    }
  }
  throw lastErr
}

module.exports = router
