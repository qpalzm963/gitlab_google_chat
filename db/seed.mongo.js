/**
 * MongoDB version of db/seed.js
 * Usage: DB_TYPE=mongodb node db/seed.mongo.js
 */
require('dotenv').config()
const bcrypt = require('bcryptjs')
const { connectMongo } = require('./mongo')
const repo = require('../src/repositories/mongodb')

const EMAIL = process.env.ADMIN_EMAIL || 'admin@company.com'
const PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123'

async function seed() {
  await connectMongo()

  const existing = await repo.user.findByEmail(EMAIL)
  if (existing) {
    console.log(`Admin already exists: ${EMAIL}`)
    process.exit(0)
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  await repo.user.create({ email: EMAIL, name: 'Admin', passwordHash, role: 'admin' })

  const verify = await repo.user.findByEmail(EMAIL)
  if (verify) {
    console.log(`✓ Admin created: ${EMAIL} / ${PASSWORD}`)
  } else {
    console.error('✗ Seed failed')
    process.exit(1)
  }

  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })
