const express = require('express')
const auth = require('../middlewares/auth')
const requireRole = require('../middlewares/role')
const repo = require('../repositories')
const { sendCard } = require('../utils/chatSend')

const router = express.Router()
router.use(auth)

function normalizeSpaceName(spaceName) {
  if (spaceName === null || spaceName === undefined) return undefined
  if (typeof spaceName !== 'string') return spaceName
  const trimmed = spaceName.trim()
  return trimmed ? trimmed : null
}

function isValidSpaceName(spaceName) {
  if (!spaceName) return false
  if (typeof spaceName !== 'string') return false
  return /^spaces\/[A-Za-z0-9]+$/.test(spaceName)
}

function buildDeptTestCard(dept) {
  const actionUrl = (process.env.CHAT_BOT_ENDPOINT || '').trim()
  return {
    text: `test card for ${dept.name}`,
    cardsV2: [
      {
        cardId: `dept-test-${dept.id}`,
        card: {
          header: {
            title: 'Google Chat 測試卡片',
            subtitle: dept.name
          },
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: dept.space_name
                      ? '這張卡片透過 Chat API 發送，按下按鈕應該回覆 pong from /chat-callback。'
                      : '這張訊息透過 Incoming Webhook 發送。未設定 Chat Space ID，所以不支援互動按鈕。'
                  }
                }
              ]
            },
            {
              widgets: dept.space_name
                ? [{
                    buttonList: {
                      buttons: [
                        {
                          text: 'Ping',
                          onClick: {
                            action: {
                              function: actionUrl || 'ping_test',
                              parameters: [
                                ...(actionUrl ? [{ key: 'method', value: 'ping_test' }] : []),
                                { key: 'dept_id', value: dept.id }
                              ]
                            }
                          }
                        }
                      ]
                    }
                  }]
                : []
            }
          ].filter(section => section.widgets.length > 0)
        }
      }
    ]
  }
}

// GET /api/departments
router.get('/', async (req, res) => {
  const depts = await repo.dept.findAll()
  if (req.user.role === 'admin') return res.json(depts)
  const allowed = req.user.dept_ids || []
  res.json(depts.filter(d => allowed.includes(d.id)))
})

// POST /api/departments
router.post('/', requireRole('admin', 'editor'), async (req, res) => {
  const platform = req.body?.platform || 'gitlab'
  const { name, webhook_secret, chat_webhook_url } = req.body

  if (!name || !webhook_secret || !chat_webhook_url) {
    return res.status(400).json({ error: 'Missing required fields: name, webhook_secret, chat_webhook_url' })
  }

  // Optional: Chat Space ID (for interactive buttons)
  const spaceName = normalizeSpaceName(req.body?.space_name)
  if (spaceName !== undefined) req.body.space_name = spaceName
  if (spaceName && !isValidSpaceName(spaceName)) {
    return res.status(400).json({ error: 'Invalid Chat Space ID format. Expected: spaces/XXXXXXXXX' })
  }

  if (platform === 'github') {
    const { github_owner, github_repo, github_token } = req.body
    if (!github_owner || !github_repo || !github_token) {
      return res.status(400).json({ error: 'Missing required fields for GitHub: github_owner, github_repo, github_token' })
    }
  } else {
    const { gitlab_base_url, gitlab_token } = req.body
    if (!gitlab_base_url || !gitlab_token) {
      return res.status(400).json({ error: 'Missing required fields for GitLab: gitlab_base_url, gitlab_token' })
    }
  }
  try {
    const dept = await repo.dept.create(req.body)
    res.status(201).json(dept)
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: '部門名稱已存在' })
    throw err
  }
})

// GET /api/departments/:id
router.get('/:id', canAccess, async (req, res) => {
  const dept = await repo.dept.findById(req.params.id)
  if (!dept) return res.status(404).json({ error: 'Not found' })
  res.json(dept)
})

// PUT /api/departments/:id
router.put('/:id', requireRole('admin', 'editor'), canAccess, async (req, res) => {
  const spaceName = normalizeSpaceName(req.body?.space_name)
  if (spaceName !== undefined) req.body.space_name = spaceName
  if (spaceName && !isValidSpaceName(spaceName)) {
    return res.status(400).json({ error: 'Invalid Chat Space ID format. Expected: spaces/XXXXXXXXX' })
  }
  const updated = await repo.dept.update(req.params.id, req.body)
  if (!updated) return res.status(404).json({ error: 'Not found' })
  res.json(updated)
})

// DELETE /api/departments/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const deleted = await repo.dept.softDelete(req.params.id)
  if (!deleted) return res.status(404).json({ error: 'Not found' })
  res.json({ message: '已刪除' })
})

// POST /api/departments/:id/test
router.post('/:id/test', requireRole('admin', 'editor'), canAccess, async (req, res) => {
  const dept = await repo.dept.findById(req.params.id, { decrypt: true })
  if (!dept) return res.status(404).json({ error: 'Not found' })
  try {
    const result = await sendCard(dept.space_name, dept.chat_webhook_url, buildDeptTestCard(dept))
    if (!result.response.ok) {
      return res.status(502).json({
        error: 'Google Chat 測試發送失敗',
        detail: result.bodyText,
        transport: result.transport
      })
    }
    res.json({
      message: dept.space_name ? '測試卡片已發送，請直接在 Google Chat 點 Ping 驗證 callback' : '測試訊息已透過 Incoming Webhook 發送',
      transport: result.transport
    })
  } catch (err) {
    res.status(502).json({ error: 'Google Chat 測試發送失敗', detail: err.message })
  }
})

// GET /api/departments/:id/logs
router.get('/:id/logs', canAccess, async (req, res) => {
  const dept = await repo.dept.findById(req.params.id)
  if (!dept) return res.status(404).json({ error: 'Not found' })
  res.json(await repo.log.findByDept(dept.id))
})

async function canAccess(req, res, next) {
  if (req.user.role === 'admin') return next()
  const dept = await repo.dept.findById(req.params.id)
  if (!dept) return res.status(404).json({ error: 'Not found' })
  if (!(req.user.dept_ids || []).includes(dept.id)) return res.status(403).json({ error: 'Forbidden' })
  next()
}

module.exports = router
