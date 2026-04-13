PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS departments (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  platform                 TEXT NOT NULL DEFAULT 'gitlab',
  gitlab_base_url          TEXT,
  gitlab_project_id        TEXT,
  gitlab_token_enc         TEXT,
  github_owner             TEXT,
  github_repo              TEXT,
  github_token_enc         TEXT,
  webhook_secret_enc       TEXT NOT NULL,
  chat_webhook_url_enc     TEXT NOT NULL,
  space_name               TEXT,
  lang                     TEXT NOT NULL DEFAULT 'zh-TW',
  ev_mr_opened             INTEGER NOT NULL DEFAULT 1,
  ev_mr_updated            INTEGER NOT NULL DEFAULT 0,
  ev_mr_merged             INTEGER NOT NULL DEFAULT 1,
  ev_allow_merge_btn       INTEGER NOT NULL DEFAULT 1,
  ev_allow_approve_btn     INTEGER NOT NULL DEFAULT 0,
  ev_allow_close_btn       INTEGER NOT NULL DEFAULT 0,
  notify_cooldown_seconds  INTEGER NOT NULL DEFAULT 0,
  is_active                INTEGER NOT NULL DEFAULT 0,
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id                 TEXT PRIMARY KEY,
  department_id      TEXT NOT NULL REFERENCES departments(id),
  event_type         TEXT NOT NULL,
  event_action       TEXT,
  gitlab_mr_iid      INTEGER,
  payload_hash       TEXT NOT NULL,
  status             TEXT NOT NULL,
  chat_response_code INTEGER,
  retry_count        INTEGER NOT NULL DEFAULT 0,
  error_message      TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  name           TEXT,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'viewer',
  dept_ids       TEXT NOT NULL DEFAULT '[]',
  is_active      INTEGER NOT NULL DEFAULT 1,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_name  ON departments(name) WHERE deleted_at IS NULL;
CREATE INDEX        IF NOT EXISTS idx_webhook_logs_dept ON webhook_logs(department_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_logs_hash ON webhook_logs(payload_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email       ON users(email);
