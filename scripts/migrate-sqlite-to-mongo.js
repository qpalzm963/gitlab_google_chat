#!/usr/bin/env node
/**
 * One-time migration: SQLite → MongoDB Atlas
 * Usage: node scripts/migrate-sqlite-to-mongo.js
 *
 * Safe to re-run (upserts by _id).
 */

require('dotenv').config()
const mongoose = require('mongoose')

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not set in .env')

  // Load SQLite db (only needed during migration)
  const sqlite = require('../db/sqlite')

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  console.log('✓ Connected to MongoDB Atlas')

  // ── Departments ────────────────────────────────────────────────────────────
  const Dept = require('../src/repositories/mongodb/deptRepository')
  const depts = sqlite.prepare('SELECT * FROM departments').all()
  console.log(`Migrating ${depts.length} departments…`)

  for (const d of depts) {
    await mongoose.connection.collection('departments').updateOne(
      { _id: d.id },
      {
        $setOnInsert: {
          _id: d.id,
          name: d.name,
          gitlab_base_url: d.gitlab_base_url,
          gitlab_project_id: d.gitlab_project_id || null,
          gitlab_token_enc: d.gitlab_token_enc,
          webhook_secret_enc: d.webhook_secret_enc,
          chat_webhook_url_enc: d.chat_webhook_url_enc,
          space_name: d.space_name || null,
          lang: d.lang || 'zh-TW',
          ev_mr_opened:       Boolean(d.ev_mr_opened),
          ev_mr_updated:      Boolean(d.ev_mr_updated),
          ev_mr_merged:       Boolean(d.ev_mr_merged),
          ev_allow_merge_btn:    Boolean(d.ev_allow_merge_btn),
          ev_allow_approve_btn:  Boolean(d.ev_allow_approve_btn),
          ev_allow_close_btn:    Boolean(d.ev_allow_close_btn),
          notify_cooldown_seconds: d.notify_cooldown_seconds || 0,
          is_active:  Boolean(d.is_active),
          deleted_at: d.deleted_at ? new Date(d.deleted_at) : null,
          created_at: new Date(d.created_at),
          updated_at: new Date(d.updated_at),
        }
      },
      { upsert: true }
    )
    console.log(`  dept: ${d.name}`)
  }

  // ── Webhook logs ───────────────────────────────────────────────────────────
  const logs = sqlite.prepare('SELECT * FROM webhook_logs').all()
  console.log(`Migrating ${logs.length} webhook logs…`)

  for (const l of logs) {
    await mongoose.connection.collection('webhooklogs').updateOne(
      { _id: l.id },
      {
        $setOnInsert: {
          _id: l.id,
          department_id: l.department_id,
          event_type: l.event_type,
          event_action: l.event_action || null,
          gitlab_mr_iid: l.gitlab_mr_iid || null,
          payload_hash: l.payload_hash,
          status: l.status,
          chat_response_code: l.chat_response_code || null,
          retry_count: l.retry_count || 0,
          error_message: l.error_message || null,
          created_at: new Date(l.created_at),
        }
      },
      { upsert: true }
    )
  }
  console.log('  logs: done')

  // ── Users ──────────────────────────────────────────────────────────────────
  const users = sqlite.prepare('SELECT * FROM users').all()
  console.log(`Migrating ${users.length} users…`)

  for (const u of users) {
    await mongoose.connection.collection('users').updateOne(
      { _id: u.id },
      {
        $setOnInsert: {
          _id: u.id,
          email: u.email,
          name: u.name || null,
          password_hash: u.password_hash,
          role: u.role || 'viewer',
          dept_ids: JSON.parse(u.dept_ids || '[]'),
          is_active: Boolean(u.is_active),
          last_login_at: u.last_login_at ? new Date(u.last_login_at) : null,
          created_at: new Date(u.created_at),
          updated_at: new Date(u.updated_at),
        }
      },
      { upsert: true }
    )
    console.log(`  user: ${u.email}`)
  }

  await mongoose.disconnect()
  console.log('✓ Migration complete')
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
