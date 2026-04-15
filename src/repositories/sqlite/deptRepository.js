const db = require('../../../db/sqlite')
const { v4: uuidv4 } = require('uuid')
const { encrypt, decrypt } = require('../../utils/crypto')

const SENSITIVE_FIELDS = ['gitlab_token', 'github_token', 'webhook_secret', 'chat_webhook_url']
const PLATFORM_GITLAB = 'gitlab'
const PLATFORM_GITHUB = 'github'

function encryptFields(data) {
  const result = { ...data }
  for (const field of SENSITIVE_FIELDS) {
    if (result[field] !== undefined && result[field] !== '') {
      result[`${field}_enc`] = encrypt(result[field])
      delete result[field]
    } else {
      delete result[field]
    }
  }
  // Backward-compatible alias: allow github_token to reuse gitlab_token from UI if needed later
  return result
}

function maskSensitive(row) {
  if (!row) return null
  const masked = { ...row }
  for (const field of SENSITIVE_FIELDS) {
    if (masked[`${field}_enc`] !== undefined) masked[`${field}_enc`] = '***'
  }
  return parseBooleans(masked)
}

function decryptRow(row) {
  if (!row) return null
  const result = { ...row }
  for (const field of SENSITIVE_FIELDS) {
    if (result[`${field}_enc`]) {
      result[field] = decrypt(result[`${field}_enc`])
      delete result[`${field}_enc`]
    }
  }
  return parseBooleans(result)
}

function parseBooleans(row) {
  const boolCols = [
    'ev_mr_opened', 'ev_mr_updated', 'ev_mr_merged',
    'ev_allow_merge_btn', 'ev_allow_approve_btn', 'ev_allow_close_btn',
    'ev_ai_summary', 'is_active'
  ]
  const result = { ...row }
  for (const col of boolCols) {
    if (col in result) result[col] = Boolean(result[col])
  }
  return result
}

function computeIsActive(row) {
  const platform = row.platform || PLATFORM_GITLAB
  if (platform === PLATFORM_GITHUB) {
    return (row.github_token_enc && row.webhook_secret_enc &&
      row.chat_webhook_url_enc && row.github_owner && row.github_repo) ? 1 : 0
  }
  return (row.gitlab_token_enc && row.webhook_secret_enc &&
    row.chat_webhook_url_enc && row.gitlab_base_url) ? 1 : 0
}

function findAll() {
  return db.prepare(
    "SELECT * FROM departments WHERE deleted_at IS NULL ORDER BY created_at DESC"
  ).all().map(maskSensitive)
}

function findById(id, { decrypt: withDecrypt = false } = {}) {
  const row = db.prepare(
    "SELECT * FROM departments WHERE id = ? AND deleted_at IS NULL"
  ).get(id)
  if (!row) return null
  return withDecrypt ? decryptRow(row) : maskSensitive(row)
}

function create(data) {
  const id = uuidv4()
  const enc = encryptFields(data)

  const toInt = v => (v === undefined ? null : v ? 1 : 0)

  db.prepare(`
    INSERT INTO departments (
      id, name, platform,
      gitlab_base_url, gitlab_project_id, gitlab_token_enc,
      github_owner, github_repo, github_token_enc,
      webhook_secret_enc, chat_webhook_url_enc,
      space_name, lang,
      ev_mr_opened, ev_mr_updated, ev_mr_merged,
      ev_allow_merge_btn, ev_allow_approve_btn, ev_allow_close_btn,
      ev_ai_summary, notify_cooldown_seconds, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, enc.name, enc.platform || PLATFORM_GITLAB,
    enc.gitlab_base_url || null, enc.gitlab_project_id || null, enc.gitlab_token_enc || null,
    enc.github_owner || null, enc.github_repo || null, enc.github_token_enc || null,
    enc.webhook_secret_enc, enc.chat_webhook_url_enc,
    enc.space_name || null, enc.lang || 'zh-TW',
    toInt(enc.ev_mr_opened) ?? 1,
    toInt(enc.ev_mr_updated) ?? 0,
    toInt(enc.ev_mr_merged) ?? 1,
    toInt(enc.ev_allow_merge_btn) ?? 1,
    toInt(enc.ev_allow_approve_btn) ?? 0,
    toInt(enc.ev_allow_close_btn) ?? 0,
    toInt(enc.ev_ai_summary) ?? 0,
    enc.notify_cooldown_seconds || 0,
    computeIsActive(enc)
  )
  return findById(id)
}

function update(id, data) {
  const existing = db.prepare(
    "SELECT * FROM departments WHERE id = ? AND deleted_at IS NULL"
  ).get(id)
  if (!existing) return null

  const enc = encryptFields(data)
  const setClauses = []
  const values = []

  const boolCols = new Set([
    'ev_mr_opened', 'ev_mr_updated', 'ev_mr_merged',
    'ev_allow_merge_btn', 'ev_allow_approve_btn', 'ev_allow_close_btn',
    'ev_ai_summary'
  ])
  const allowed = [
    'name', 'platform',
    'gitlab_base_url', 'gitlab_project_id', 'gitlab_token_enc',
    'github_owner', 'github_repo', 'github_token_enc',
    'webhook_secret_enc', 'chat_webhook_url_enc',
    'space_name', 'lang',
    'ev_mr_opened', 'ev_mr_updated', 'ev_mr_merged',
    'ev_allow_merge_btn', 'ev_allow_approve_btn', 'ev_allow_close_btn',
    'ev_ai_summary',
    'notify_cooldown_seconds'
  ]

  for (const col of allowed) {
    if (enc[col] !== undefined) {
      setClauses.push(`${col} = ?`)
      values.push(boolCols.has(col) ? (enc[col] ? 1 : 0) : enc[col])
    }
  }

  if (setClauses.length === 0) return findById(id)

  // 重新計算 is_active
  const merged = { ...existing, ...enc }
  setClauses.push('is_active = ?')
  values.push(computeIsActive(merged))
  setClauses.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
  values.push(id)

  db.prepare(`UPDATE departments SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...values)
  return findById(id)
}

function softDelete(id) {
  const result = db.prepare(
    "UPDATE departments SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), is_active = 0 WHERE id = ? AND deleted_at IS NULL"
  ).run(id)
  return result.changes > 0
}

module.exports = { findAll, findById, create, update, softDelete }
