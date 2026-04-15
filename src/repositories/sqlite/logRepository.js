const db = require('../../../db/sqlite')
const { v4: uuidv4 } = require('uuid')
const { buildDashboardMetrics, normalizeRangeDays } = require('../dashboardMetrics')

function create({ departmentId, eventType, eventAction, gitlabMrIid, payloadHash, status, chatResponseCode, retryCount = 0, errorMessage, chatMessageName }) {
  const id = uuidv4()
  db.prepare(`
    INSERT INTO webhook_logs
      (id, department_id, event_type, event_action, gitlab_mr_iid, payload_hash, status, chat_response_code, retry_count, error_message, chat_message_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, departmentId, eventType, eventAction || null, gitlabMrIid || null, payloadHash, status, chatResponseCode || null, retryCount, errorMessage || null, chatMessageName || null)
  return id
}

function findLatestSentByDeptAndMr(departmentId, mrIid) {
  return db.prepare(`
    SELECT chat_message_name FROM webhook_logs
    WHERE department_id = ? AND gitlab_mr_iid = ? AND status = 'sent' AND chat_message_name IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(departmentId, mrIid)
}

function findByHash(payloadHash) {
  return db.prepare('SELECT id FROM webhook_logs WHERE payload_hash = ?').get(payloadHash)
}

function findByDept(departmentId, limit = 50) {
  return db.prepare(
    'SELECT * FROM webhook_logs WHERE department_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(departmentId, limit)
}

function getDashboardOverview({ rangeDays = 7, departments = [] } = {}) {
  const normalizedRangeDays = normalizeRangeDays(rangeDays)
  if (departments.length === 0) {
    return buildDashboardMetrics({ departments: [], logs: [], rangeDays: normalizedRangeDays })
  }

  const sinceIso = new Date(Date.now() - (normalizedRangeDays - 1) * 24 * 60 * 60 * 1000).toISOString()
  const placeholders = departments.map(() => '?').join(', ')
  const logs = db.prepare(`
    SELECT department_id, status, created_at
    FROM webhook_logs
    WHERE department_id IN (${placeholders})
      AND created_at >= ?
    ORDER BY created_at DESC
  `).all(...departments.map(({ id }) => id), sinceIso)

  return buildDashboardMetrics({
    departments,
    logs,
    rangeDays: normalizedRangeDays
  })
}

module.exports = { create, findByHash, findByDept, findLatestSentByDeptAndMr, getDashboardOverview }
