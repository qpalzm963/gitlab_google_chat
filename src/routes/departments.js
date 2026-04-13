const express = require('express')
const auth = require('../middlewares/auth')
const requireRole = require('../middlewares/role')
const repo = require('../repositories')

const router = express.Router()
router.use(auth)

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
    const response = await fetch(dept.chat_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🔔 *[測試訊息]* 部門 *${dept.name}* 的 Google Chat Webhook 連線正常！` })
    })
    if (!response.ok) {
      return res.status(502).json({ error: 'Chat Webhook 連線失敗', detail: await response.text() })
    }
    res.json({ message: '測試訊息已發送' })
  } catch (err) {
    res.status(502).json({ error: 'Chat Webhook 連線失敗', detail: err.message })
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
