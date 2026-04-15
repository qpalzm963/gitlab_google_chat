function normalizeRangeDays(value) {
  return String(value) === '30' ? 30 : 7
}

function toUtcDayKey(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function formatShortDate(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return `${month}/${day}`
}

function buildDailyBuckets(rangeDays) {
  const buckets = []
  const map = new Map()
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - (rangeDays - 1))

  for (let index = 0; index < rangeDays; index += 1) {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    const dayKey = date.toISOString().slice(0, 10)
    const bucket = {
      date: dayKey,
      label: formatShortDate(dayKey),
      total_events: 0,
      failed_events: 0
    }
    buckets.push(bucket)
    map.set(dayKey, bucket)
  }

  return { buckets, map }
}

function toSuccessRate(sentEvents, totalEvents) {
  if (totalEvents === 0) return 0
  return Number(((sentEvents / totalEvents) * 100).toFixed(1))
}

function sortDepartmentMetrics(left, right) {
  if (right.total_events !== left.total_events) return right.total_events - left.total_events
  if (right.failed_events !== left.failed_events) return right.failed_events - left.failed_events
  if (right.last_event_at && left.last_event_at && right.last_event_at !== left.last_event_at) {
    return right.last_event_at.localeCompare(left.last_event_at)
  }
  if (right.last_event_at && !left.last_event_at) return 1
  if (!right.last_event_at && left.last_event_at) return -1
  return left.dept_name.localeCompare(right.dept_name, 'zh-Hant')
}

function buildDashboardMetrics({ departments = [], logs = [], rangeDays = 7 } = {}) {
  const normalizedRangeDays = normalizeRangeDays(rangeDays)
  const { buckets, map: trendMap } = buildDailyBuckets(normalizedRangeDays)
  const departmentMetrics = new Map(
    departments.map(dept => [dept.id, {
      dept_id: dept.id,
      dept_name: dept.name,
      total_events: 0,
      sent_events: 0,
      failed_events: 0,
      duplicate_events: 0,
      success_rate: 0,
      last_event_at: null
    }])
  )

  let sentEvents = 0
  let failedEvents = 0
  let duplicateEvents = 0
  let lastUpdatedAt = null

  for (const log of logs) {
    const deptMetric = departmentMetrics.get(log.department_id)
    if (!deptMetric) continue

    deptMetric.total_events += 1
    deptMetric.last_event_at = !deptMetric.last_event_at || log.created_at > deptMetric.last_event_at
      ? log.created_at
      : deptMetric.last_event_at

    const dayKey = toUtcDayKey(log.created_at)
    const trendBucket = trendMap.get(dayKey)
    if (trendBucket) trendBucket.total_events += 1

    if (log.status === 'sent') {
      sentEvents += 1
      deptMetric.sent_events += 1
    } else if (log.status === 'failed') {
      failedEvents += 1
      deptMetric.failed_events += 1
      if (trendBucket) trendBucket.failed_events += 1
    } else if (log.status === 'duplicate') {
      duplicateEvents += 1
      deptMetric.duplicate_events += 1
    }

    lastUpdatedAt = !lastUpdatedAt || log.created_at > lastUpdatedAt ? log.created_at : lastUpdatedAt
  }

  const departmentList = Array.from(departmentMetrics.values())
    .map(metric => ({
      ...metric,
      success_rate: toSuccessRate(metric.sent_events, metric.total_events)
    }))
    .sort(sortDepartmentMetrics)

  return {
    summary: {
      total_events: logs.length,
      sent_events: sentEvents,
      failed_events: failedEvents,
      duplicate_events: duplicateEvents,
      success_rate: toSuccessRate(sentEvents, logs.length)
    },
    trend: buckets,
    departments: departmentList,
    alerts: departmentList.filter(metric => metric.failed_events > 0).slice(0, 5),
    last_updated_at: lastUpdatedAt
  }
}

module.exports = {
  buildDashboardMetrics,
  normalizeRangeDays
}
