const { buildDashboardMetrics } = require('../src/repositories/dashboardMetrics')

describe('dashboard metrics builder', () => {
  test('aggregates totals, trends, rankings, and alerts', () => {
    const result = buildDashboardMetrics({
      rangeDays: 7,
      departments: [
        { id: 'dept-a', name: 'Alpha' },
        { id: 'dept-b', name: 'Beta' }
      ],
      logs: [
        { department_id: 'dept-a', status: 'sent', created_at: '2026-04-13T01:00:00.000Z' },
        { department_id: 'dept-a', status: 'failed', created_at: '2026-04-14T02:00:00.000Z' },
        { department_id: 'dept-b', status: 'duplicate', created_at: '2026-04-14T03:00:00.000Z' }
      ]
    })

    expect(result.summary).toEqual({
      total_events: 3,
      sent_events: 1,
      failed_events: 1,
      duplicate_events: 1,
      success_rate: 33.3
    })
    expect(result.trend).toHaveLength(7)
    expect(result.departments[0]).toMatchObject({
      dept_id: 'dept-a',
      dept_name: 'Alpha',
      total_events: 2,
      failed_events: 1,
      success_rate: 50
    })
    expect(result.departments[1]).toMatchObject({
      dept_id: 'dept-b',
      total_events: 1,
      duplicate_events: 1,
      success_rate: 0
    })
    expect(result.alerts).toEqual([
      expect.objectContaining({ dept_id: 'dept-a', failed_events: 1 })
    ])
    expect(result.last_updated_at).toBe('2026-04-14T03:00:00.000Z')
  })

  test('includes empty departments and zero-filled trend buckets', () => {
    const result = buildDashboardMetrics({
      rangeDays: 30,
      departments: [{ id: 'dept-a', name: 'Alpha' }],
      logs: []
    })

    expect(result.summary.total_events).toBe(0)
    expect(result.summary.success_rate).toBe(0)
    expect(result.trend).toHaveLength(30)
    expect(result.departments).toEqual([
      expect.objectContaining({
        dept_id: 'dept-a',
        total_events: 0,
        success_rate: 0,
        last_event_at: null
      })
    ])
    expect(result.alerts).toEqual([])
    expect(result.last_updated_at).toBeNull()
  })
})
