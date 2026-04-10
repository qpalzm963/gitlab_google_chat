const mongoose = require('mongoose')
const { v4: uuidv4 } = require('uuid')

const schema = new mongoose.Schema({
  _id:           { type: String },
  email:         { type: String, required: true, unique: true },
  name:          { type: String, default: null },
  password_hash: { type: String, required: true },
  role:          { type: String, default: 'viewer' },
  dept_ids:      { type: [String], default: [] },
  is_active:     { type: Boolean, default: true },
  last_login_at: { type: Date, default: null },
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

const User = mongoose.models.User || mongoose.model('User', schema)

async function findByEmail(email) {
  const doc = await User.findOne({ email, is_active: true })
  return doc ? doc.toJSON() : null
}

async function findById(id) {
  const doc = await User.findOne({ _id: id, is_active: true })
  return doc ? doc.toJSON() : null
}

async function create({ email, name, passwordHash, role = 'viewer', deptIds = [] }) {
  const id = uuidv4()
  await User.create({ _id: id, email, name: name || null, password_hash: passwordHash, role, dept_ids: deptIds })
  return findById(id)
}

async function updateLastLogin(id) {
  await User.updateOne({ _id: id }, { $set: { last_login_at: new Date() } })
}

// Compatibility shim — MongoDB version already returns parsed arrays
function parse(user) {
  return user
}

module.exports = { findByEmail, findById, create, updateLastLogin, parse }
