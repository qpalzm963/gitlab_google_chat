const mongoose = require('mongoose')
const { v4: uuidv4 } = require('uuid')
const { encrypt, decrypt } = require('../../utils/crypto')

const SENSITIVE_FIELDS = ['gitlab_token', 'github_token', 'webhook_secret', 'chat_webhook_url']
const PLATFORM_GITLAB = 'gitlab'
const PLATFORM_GITHUB = 'github'

// ── Schema ──────────────────────────────────────────────────────────────────
const schema = new mongoose.Schema({
  _id:                   { type: String },
  name:                  { type: String, required: true },
  platform:              { type: String, default: PLATFORM_GITLAB },
  gitlab_base_url:       { type: String, default: null },
  gitlab_project_id:     { type: String, default: null },
  gitlab_token_enc:      { type: String, default: null },
  github_owner:          { type: String, default: null },
  github_repo:           { type: String, default: null },
  github_token_enc:      { type: String, default: null },
  webhook_secret_enc:    { type: String, required: true },
  chat_webhook_url_enc:  { type: String, required: true },
  space_name:            { type: String, default: null },
  lang:                  { type: String, default: 'zh-TW' },
  ev_mr_opened:          { type: Boolean, default: true },
  ev_mr_updated:         { type: Boolean, default: false },
  ev_mr_merged:          { type: Boolean, default: true },
  ev_allow_merge_btn:    { type: Boolean, default: true },
  ev_allow_approve_btn:  { type: Boolean, default: false },
  ev_allow_close_btn:    { type: Boolean, default: false },
  notify_cooldown_seconds: { type: Number, default: 0 },
  is_active:             { type: Boolean, default: false },
  deleted_at:            { type: Date, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: {
    transform(doc, ret) {
      ret.id = ret._id
      delete ret._id
      delete ret.__v
    }
  }
})

// Unique name per non-deleted department
schema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
)

const Dept = mongoose.models.Department || mongoose.model('Department', schema)

// ── Helpers ──────────────────────────────────────────────────────────────────
function encryptFields(data) {
  const result = { ...data }
  for (const field of SENSITIVE_FIELDS) {
    if (result[field] !== undefined && result[field] !== '') {
      result[`${field}_enc`] = encrypt(result[field])
    }
    delete result[field]
  }
  return result
}

function computeIsActive(row) {
  const platform = row.platform || PLATFORM_GITLAB
  if (platform === PLATFORM_GITHUB) {
    return !!(row.github_token_enc && row.webhook_secret_enc &&
      row.chat_webhook_url_enc && row.github_owner && row.github_repo)
  }
  return !!(row.gitlab_token_enc && row.webhook_secret_enc &&
    row.chat_webhook_url_enc && row.gitlab_base_url)
}

function maskSensitive(doc) {
  if (!doc) return null
  const obj = doc.toJSON ? doc.toJSON() : { ...doc }
  for (const field of SENSITIVE_FIELDS) {
    if (obj[`${field}_enc`] !== undefined) obj[`${field}_enc`] = '***'
  }
  return obj
}

function decryptDoc(doc) {
  if (!doc) return null
  const obj = doc.toJSON ? doc.toJSON() : { ...doc }
  for (const field of SENSITIVE_FIELDS) {
    if (obj[`${field}_enc`]) {
      obj[field] = decrypt(obj[`${field}_enc`])
      delete obj[`${field}_enc`]
    }
  }
  return obj
}

// ── Repository ────────────────────────────────────────────────────────────────
async function findAll() {
  const docs = await Dept.find({ deleted_at: null }).sort({ created_at: -1 })
  return docs.map(maskSensitive)
}

async function findById(id, { decrypt: withDecrypt = false } = {}) {
  const doc = await Dept.findOne({ _id: id, deleted_at: null })
  if (!doc) return null
  return withDecrypt ? decryptDoc(doc) : maskSensitive(doc)
}

async function create(data) {
  const id = uuidv4()
  const enc = encryptFields(data)

  const doc = new Dept({
    _id: id,
    name: enc.name,
    platform: enc.platform || PLATFORM_GITLAB,
    gitlab_base_url: enc.gitlab_base_url || null,
    gitlab_project_id: enc.gitlab_project_id || null,
    gitlab_token_enc: enc.gitlab_token_enc || null,
    github_owner: enc.github_owner || null,
    github_repo: enc.github_repo || null,
    github_token_enc: enc.github_token_enc || null,
    webhook_secret_enc: enc.webhook_secret_enc,
    chat_webhook_url_enc: enc.chat_webhook_url_enc,
    space_name: enc.space_name || null,
    lang: enc.lang || 'zh-TW',
    ev_mr_opened:       enc.ev_mr_opened       ?? true,
    ev_mr_updated:      enc.ev_mr_updated       ?? false,
    ev_mr_merged:       enc.ev_mr_merged        ?? true,
    ev_allow_merge_btn:    enc.ev_allow_merge_btn    ?? true,
    ev_allow_approve_btn:  enc.ev_allow_approve_btn  ?? false,
    ev_allow_close_btn:    enc.ev_allow_close_btn    ?? false,
    notify_cooldown_seconds: enc.notify_cooldown_seconds || 0,
    is_active: computeIsActive(enc),
  })

  try {
    await doc.save()
  } catch (err) {
    if (err.code === 11000) {
      const e = new Error('UNIQUE constraint failed: departments.name')
      e.code = 'SQLITE_CONSTRAINT_UNIQUE' // preserve route error check
      throw e
    }
    throw err
  }

  return findById(id)
}

async function update(id, data) {
  const existing = await Dept.findOne({ _id: id, deleted_at: null })
  if (!existing) return null

  const enc = encryptFields(data)
  const allowed = [
    'name', 'platform',
    'gitlab_base_url', 'gitlab_project_id', 'gitlab_token_enc',
    'github_owner', 'github_repo', 'github_token_enc',
    'webhook_secret_enc', 'chat_webhook_url_enc',
    'space_name', 'lang',
    'ev_mr_opened', 'ev_mr_updated', 'ev_mr_merged',
    'ev_allow_merge_btn', 'ev_allow_approve_btn', 'ev_allow_close_btn',
    'notify_cooldown_seconds'
  ]

  const $set = {}
  for (const col of allowed) {
    if (enc[col] !== undefined) $set[col] = enc[col]
  }

  if (Object.keys($set).length === 0) return findById(id)

  // Recompute is_active from merged state
  const merged = { ...existing.toObject(), ...$set }
  $set.is_active = computeIsActive(merged)

  await Dept.updateOne({ _id: id, deleted_at: null }, { $set })
  return findById(id)
}

async function softDelete(id) {
  const result = await Dept.updateOne(
    { _id: id, deleted_at: null },
    { $set: { deleted_at: new Date(), is_active: false } }
  )
  return result.modifiedCount > 0
}

module.exports = { findAll, findById, create, update, softDelete }
