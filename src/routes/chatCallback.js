const express = require('express')
const { OAuth2Client } = require('google-auth-library')
const repo = require('../repositories')

const router = express.Router()
const client = new OAuth2Client()

router.post('/', async (req, res) => {
  try {
    // 1. 驗證 Google JWT
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) return res.status(403).json({ error: 'Missing authorization' })

    try {
      await client.verifyIdToken({
        idToken: token,
        audience: process.env.CHAT_BOT_ENDPOINT
      })
    } catch (err) {
      console.error('[chat-callback] JWT verification failed:', err.message)
      return res.status(403).json({ error: 'Invalid Google JWT' })
    }

    // 2. 解析 action
    const event = req.body
    const action = event?.common?.invokedFunction || event?.action?.function
    const params = parseParams(event?.common?.parameters || event?.action?.parameters)

    const projectId = params.project_id
    const mrIid = params.mr_iid
    const deptId = params.dept_id

    console.log('[chat-callback] action=%s projectId=%s mrIid=%s deptId=%s', action, projectId, mrIid, deptId)

    if (!action || !projectId || !mrIid || !deptId) {
      console.error('[chat-callback] Missing params, body:', JSON.stringify(req.body))
      return res.json({ text: '❌ 請求參數不完整，無法處理此操作。' })
    }

    // 3. 查詢部門設定（取 GitLab token + base URL）
    const dept = await repo.dept.findById(deptId, { decrypt: true })
    if (!dept) return res.json({ text: '❌ 找不到部門設定。' })

    // 4. 確認按鈕權限
    const allowed = {
      merge_mr: dept.ev_allow_merge_btn,
      approve_mr: dept.ev_allow_approve_btn,
      close_mr: dept.ev_allow_close_btn
    }
    if (!allowed[action]) {
      return res.json({ text: '❌ 此操作未啟用，請至管理介面開啟對應按鈕權限。' })
    }

    // 5. 呼叫 GitLab API
    const baseUrl = `${dept.gitlab_base_url}/api/v4/projects/${projectId}/merge_requests/${mrIid}`
    const headers = { 'PRIVATE-TOKEN': dept.gitlab_token, 'Content-Type': 'application/json' }

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
    } else {
      return res.json({ text: `❌ 未知操作：${action}` })
    }

    if (gitlabRes.status === 401) {
      return res.json({ text: '❌ GitLab Token 已失效，請聯絡管理員更新設定。' })
    }
    if (gitlabRes.status === 405) {
      return res.json({ text: '❌ 無法執行：CI 尚未通過或 MR 狀態不允許此操作。' })
    }
    if (!gitlabRes.ok) {
      const body = await gitlabRes.text()
      console.error('[chat-callback] GitLab error %d: %s', gitlabRes.status, body)
      return res.json({ text: `❌ GitLab 錯誤 (${gitlabRes.status})：${body.slice(0, 200)}` })
    }

    const messages = {
      merge_mr: '✅ MR 已成功 Merge！',
      approve_mr: '👍 MR 已 Approve！',
      close_mr: '🔒 MR 已關閉。'
    }
    return res.json({ text: messages[action] })

  } catch (err) {
    console.error('[chat-callback] Unhandled error:', err)
    return res.json({ text: `❌ 伺服器內部錯誤：${err.message}` })
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
