const express = require('express')
const crypto = require('crypto')
const repo = require('../repositories')
const { buildPayloadHash } = require('../utils/hash')
const { buildCard } = require('../utils/chatCard')
const { decrypt } = require('../utils/crypto')

const router = express.Router()

// 支援的事件類型（X-Gitlab-Event header）
const SUPPORTED_EVENTS = new Set(['Merge Request Hook'])

// 事件類型 header → DB event_type
const EVENT_TYPE_MAP = {
  'Merge Request Hook': 'merge_request',
  'Push Hook': 'push',
  'Note Hook': 'note'
}

router.post('/', async (req, res) => {
  const deptId = req.query.dept
  if (!deptId) return res.status(400).json({ error: 'Missing dept parameter' })

  const gitlabEvent = req.headers['x-gitlab-event']
  const eventUUID = req.headers['x-gitlab-event-uuid']
  const receivedToken = req.headers['x-gitlab-token']

  // 1. 僅處理 Merge Request Hook
  if (!SUPPORTED_EVENTS.has(gitlabEvent)) {
    return res.status(200).json({ message: 'Event type not handled' })
  }

  // 2. 查詢部門設定（含解密）
  const dept = await repo.dept.findById(deptId, { decrypt: true })
  if (!dept || !dept.is_active) {
    return res.status(400).json({ error: 'Department not found or inactive' })
  }

  // 3a. 選填 project_id 驗證
  const payloadProjectId = String(req.body?.project?.id || '')
  if (dept.gitlab_project_id && payloadProjectId && payloadProjectId !== dept.gitlab_project_id) {
    return res.status(400).json({ error: 'Project ID mismatch' })
  }

  // 3b. 驗證 X-Gitlab-Token
  if (!receivedToken || !verifySecret(receivedToken, dept.webhook_secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const payload = req.body
  const eventType = EVENT_TYPE_MAP[gitlabEvent] || 'unknown'
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

  res.status(200).json({ message: status })
})

function verifySecret(received, stored) {
  try {
    const a = Buffer.from(received)
    const b = Buffer.from(stored)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
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
