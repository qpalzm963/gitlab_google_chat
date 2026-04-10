require('dotenv').config()
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const db = require('./sqlite')

const EMAIL = process.env.ADMIN_EMAIL || 'admin@company.com'
const PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123'

async function seed() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL)
  if (existing) {
    console.log(`Admin already exists: ${EMAIL}`)
    return
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const id = uuidv4()
  db.prepare(
    'INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, EMAIL, 'Admin', passwordHash, 'admin')

  const verify = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL)
  if (verify) {
    console.log(`✓ Admin created: ${EMAIL} / ${PASSWORD}`)
  } else {
    console.error('✗ Seed failed: user not found after insert')
    process.exit(1)
  }
}

seed()
