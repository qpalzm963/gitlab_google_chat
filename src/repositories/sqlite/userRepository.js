const db = require('../../../db/sqlite')
const { v4: uuidv4 } = require('uuid')

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email)
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(id)
}

function create({ email, name, passwordHash, role = 'viewer', deptIds = [] }) {
  const id = uuidv4()
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, role, dept_ids)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, email, name || null, passwordHash, role, JSON.stringify(deptIds))
  return findById(id)
}

function updateLastLogin(id) {
  db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(id)
}

function parse(user) {
  if (!user) return null
  return {
    ...user,
    dept_ids: JSON.parse(user.dept_ids || '[]'),
    is_active: Boolean(user.is_active)
  }
}

module.exports = { findByEmail, findById, create, updateLastLogin, parse }
