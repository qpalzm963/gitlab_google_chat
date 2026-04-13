const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/app.db')

// 確保 data/ 目錄存在
const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

function hasColumn(table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all()
    return cols.some(c => c.name === column)
  } catch {
    return false
  }
}

function ensureSchema() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    db.exec(schema)
  } catch (err) {
    console.error('Failed to ensure SQLite schema:', err.message)
  }
}

function migrateDepartmentsTableV2IfNeeded() {
  // v2: add GitHub support columns
  const needsMigrate =
    !hasColumn('departments', 'platform') ||
    !hasColumn('departments', 'github_owner') ||
    !hasColumn('departments', 'github_repo') ||
    !hasColumn('departments', 'github_token_enc')

  if (!needsMigrate) return

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')

  db.exec('PRAGMA foreign_keys=OFF;')
  try {
    const tx = db.transaction(() => {
      db.exec('ALTER TABLE departments RENAME TO departments_old;')
      db.exec(schema)

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
    console.log('✓ SQLite departments migrated to v2 (GitHub support)')
  } catch (err) {
    console.error('SQLite migration v2 failed:', err.message)
    // Best-effort: keep the old table name so the operator can recover manually.
  } finally {
    db.exec('PRAGMA foreign_keys=ON;')
  }
}

ensureSchema()
migrateDepartmentsTableV2IfNeeded()

module.exports = db
