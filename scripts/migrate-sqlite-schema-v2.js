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

migrateDepartmentsTableV2()

