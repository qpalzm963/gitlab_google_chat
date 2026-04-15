#!/usr/bin/env node
require('dotenv').config()

const repo = require('../src/repositories')

function isValidSpaceName(spaceName) {
  if (!spaceName) return false
  if (typeof spaceName !== 'string') return false
  const s = spaceName.trim()
  if (!s) return false
  return /^spaces\/[A-Za-z0-9]+$/.test(s)
}

async function main() {
  const dbType = (process.env.DB_TYPE || 'sqlite').trim()
  if (dbType === 'mongodb') {
    const { connectMongo } = require('../db/mongo')
    await connectMongo()
  }

  const depts = await repo.dept.findAll()

  const rows = depts.map(d => {
    const spaceName = (d.space_name || '').trim()
    const status = spaceName ? (isValidSpaceName(spaceName) ? 'OK' : 'INVALID') : 'MISSING'
    return {
      id: d.id,
      name: d.name,
      platform: d.platform || 'gitlab',
      space_name: spaceName || '',
      status
    }
  })

  const missing = rows.filter(r => r.status !== 'OK')

  console.log('')
  console.log('Department Chat Space ID status')
  console.log('DB_TYPE=%s', dbType)
  console.log('')
  console.table(rows)
  console.log('')
  console.log('Needs action: %d / %d', missing.length, rows.length)
  if (missing.length) {
    console.log('Hint: login and edit each dept → "Chat Space ID" → paste "spaces/XXXXXXXXX".')
  }
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})

