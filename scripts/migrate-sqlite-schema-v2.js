require('dotenv').config()
const fs = require('fs')
const path = require('path')
const db = require('../db/sqlite')

function hasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  return cols.some(c => c.name === column)
}

function migrateDepartmentsTableV2() {
  const needsMigrate =
    !hasColumn('departments', 'platform') ||
    !hasColumn('departments', 'github_owner') ||
    !hasColumn('departments', 'github_repo') ||
    !hasColumn('departments', 'github_token_enc')

  if (!needsMigrate) {
    console.log('✓ SQLite schema already supports GitHub (v2)')
    return
  }

  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8')

  db.exec('PRAGMA foreign_keys=OFF;')
  const tx = db.transaction(() => {
    db.exec('ALTER TABLE departments RENAME TO departments_old;')
    db.exec(schema)

    // Copy existing rows (GitLab depts) into the new schema.
    db.exec(`
      INSERT INTO departments (
        id, name, platform,
        gitlab_base_url, gitlab_project_id, gitlab_token_enc,
        github_owner, github_repo, github_token_enc,
        webhook_secret_enc, chat_webhook_url_enc,
        space_name, lang,
        ev_mr_opened, ev_mr_updated, ev_mr_merged,
        ev_allow_merge_btn, ev_allow_approve_btn, ev_allow_close_btn,
        notify_cooldown_seconds, is_active,
        deleted_at, created_at, updated_at
      )
      SELECT
        id, name, 'gitlab',
        gitlab_base_url, gitlab_project_id, gitlab_token_enc,
        NULL, NULL, NULL,
        webhook_secret_enc, chat_webhook_url_enc,
        space_name, lang,
        ev_mr_opened, ev_mr_updated, ev_mr_merged,
        ev_allow_merge_btn, ev_allow_approve_btn, ev_allow_close_btn,
        notify_cooldown_seconds, is_active,
        deleted_at, created_at, updated_at
      FROM departments_old;
    `)

    db.exec('DROP TABLE departments_old;')
  })

  tx()
  db.exec('PRAGMA foreign_keys=ON;')

  console.log('✓ SQLite departments migrated to v2 (GitHub support)')
}

function migrateWebhookLogsV2() {
  if (hasColumn('webhook_logs', 'chat_message_name')) {
    console.log('✓ webhook_logs.chat_message_name already exists')
    return
  }
  db.prepare('ALTER TABLE webhook_logs ADD COLUMN chat_message_name TEXT').run()
  console.log('✓ webhook_logs.chat_message_name column added')
}

function migrateDepartmentsAiSummary() {
  if (hasColumn('departments', 'ev_ai_summary')) {
    console.log('✓ departments.ev_ai_summary already exists')
    return
  }
  db.prepare('ALTER TABLE departments ADD COLUMN ev_ai_summary INTEGER NOT NULL DEFAULT 0').run()
  console.log('✓ departments.ev_ai_summary column added')
}

migrateDepartmentsTableV2()
migrateWebhookLogsV2()
migrateDepartmentsAiSummary()

