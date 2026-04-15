const mongoose = require('mongoose')
const { v4: uuidv4 } = require('uuid')

const schema = new mongoose.Schema({
  _id:              { type: String },
  department_id:    { type: String, required: true },
  event_type:       { type: String, required: true },
  event_action:     { type: String, default: null },
  gitlab_mr_iid:    { type: Number, default: null },
  payload_hash:     { type: String, required: true },
  status:           { type: String, required: true },
  chat_response_code: { type: Number, default: null },
  retry_count:      { type: Number, default: 0 },
  error_message:    { type: String, default: null },
  chat_message_name: { type: String, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false },
  toJSON: {
    transform(doc, ret) {
      ret.id = ret._id
      delete ret._id
      delete ret.__v
    }
  }
})

schema.index({ payload_hash: 1 }, { unique: true })
schema.index({ department_id: 1, created_at: -1 })

const Log = mongoose.models.WebhookLog || mongoose.model('WebhookLog', schema)

async function create({ departmentId, eventType, eventAction, gitlabMrIid, payloadHash, status, chatResponseCode, retryCount = 0, errorMessage, chatMessageName }) {
  const id = uuidv4()
  await Log.create({
    _id: id,
    department_id: departmentId,
    event_type: eventType,
    event_action: eventAction || null,
    gitlab_mr_iid: gitlabMrIid || null,
    payload_hash: payloadHash,
    status,
    chat_response_code: chatResponseCode || null,
    retry_count: retryCount,
    error_message: errorMessage || null,
    chat_message_name: chatMessageName || null,
  })
  return id
}

async function findLatestSentByDeptAndMr(departmentId, mrIid) {
  return Log.findOne({
    department_id: departmentId,
    gitlab_mr_iid: mrIid,
    status: 'sent',
    chat_message_name: { $ne: null }
  }, { chat_message_name: 1 }).sort({ created_at: -1 }).lean()
}

async function findByHash(payloadHash) {
  return Log.findOne({ payload_hash: payloadHash }, { _id: 1 }).lean()
}

async function findByDept(departmentId, limit = 50) {
  const docs = await Log.find({ department_id: departmentId })
    .sort({ created_at: -1 })
    .limit(limit)
  return docs.map(d => d.toJSON())
}

module.exports = { create, findByHash, findByDept, findLatestSentByDeptAndMr }
