const express = require('express')
const { OAuth2Client } = require('google-auth-library')
const repo = require('../repositories')

const router = express.Router()
const client = new OAuth2Client()

router.post('/', async (req, res) => {
  // 1. 驗證 Google JWT
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  if (!token) return res.status(403).json({ error: 'Missing authorization' })

  try {
    await client.verifyIdToken({
      idToken: token,
      audience: process.env.CHAT_BOT_ENDPOINT
    })
  } catch {
    return res.status(403).json({ error: 'Invalid Google JWT' })
  }

  // 2. 解析 action
  const event = req.body
  const action = event?.common?.invokedFunction || event?.action?.function
  const params = parseParams(event?.common?.parameters || event?.action?.parameters)

  const projectId = params.project_id
  const mrIid = params.mr_iid
  const deptId = params.dept_id

  if (!action || !projectId || !mrIid || !deptId) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  // 3. 查詢部門設定（取 GitLab token + base URL）
  const dept = repo.dept.findById(deptId, { decrypt: true })
  if (!dept) return res.status(404).json({ text: '找不到部門設定' })

  // 4. 確認按鈕權限
  const allowed = {
    merge_mr: dept.ev_allow_merge_btn,
    approve_mr: dept.ev_allow_approve_btn,
    close_mr: dept.ev_allow_close_btn
  }
  if (!allowed[action]) {
    return res.status(403).json({ text: '此操作未啟用' })
  }

  // 5. 呼叫 GitLab API
  const baseUrl = `${dept.gitlab_base_url}/api/v4/projects/${projectId}/merge_requests/${mrIid}`
  const headers = { 'PRIVATE-TOKEN': dept.gitlab_token, 'Content-Type': 'application/json' }

  try {
    let gitlabRes

    if (action === 'merge_mr') {
      gitlabRes = await fetch(`${baseUrl}/merge`, { method: 'PUT', headers })
    } else if (action === 'approve_mr') {
      gitlabRes = await fetch(`${baseUrl}/approve`, { method: 'POST', headers })
    } else if (action === 'close_mr') {
      gitlabRes = await fetch(baseUrl, {
        method: 'PUT', headers,
        body: JSON.stringify({ state_event: 'close' })
      })
    }

    if (gitlabRes.status === 401) {
      return res.json({ text: '❌ GitLab Token 已失效，請聯絡管理員更新設定。' })
    }
    if (gitlabRes.status === 405) {
      return res.json({ text: '❌ 無法執行：CI 尚未通過或 MR 狀態不允許此操作。' })
    }
    if (!gitlabRes.ok) {
      const body = await gitlabRes.text()
      return res.json({ text: `❌ GitLab 錯誤 (${gitlabRes.status})：${body.slice(0, 200)}` })
    }

    const messages = {
      merge_mr: '✅ MR 已成功 Merge！',
      approve_mr: '👍 MR 已 Approve！',
      close_mr: '🔒 MR 已關閉。'
    }
    return res.json({ text: messages[action] })
  } catch (err) {
    return res.status(500).json({ text: `❌ 伺服器錯誤：${err.message}` })
  }
})

function parseParams(params) {
  if (!params) return {}
  if (Array.isArray(params)) {
    return params.reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {})
  }
  return params
}

module.exports = router
