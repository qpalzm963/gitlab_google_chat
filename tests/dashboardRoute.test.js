jest.mock('../src/repositories', () => ({
  dept: {
    findAll: jest.fn()
  },
  log: {
    getDashboardOverview: jest.fn()
  }
}))

const repo = require('../src/repositories')
const router = require('../src/routes/dashboard')

function getRouteHandler() {
  const layer = router.stack.find(entry => entry.route?.path === '/' && entry.route.methods?.get)
  return layer.route.stack[0].handle
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  }
}

describe('dashboard route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    repo.log.getDashboardOverview.mockResolvedValue({
      summary: {
        total_events: 2,
        sent_events: 1,
        failed_events: 1,
        duplicate_events: 0,
        success_rate: 50
      },
      trend: [],
      departments: [],
      alerts: [],
      last_updated_at: '2026-04-15T00:00:00.000Z'
    })
  })

  test('returns all departments for admin users', async () => {
    repo.dept.findAll.mockResolvedValue([
      { id: 'dept-a', name: 'Alpha' },
      { id: 'dept-b', name: 'Beta' }
    ])

    const handler = getRouteHandler()
    const req = {
      query: { range: '30' },
      user: { role: 'admin', dept_ids: [] }
    }
    const res = createRes()

    await handler(req, res)

    expect(repo.log.getDashboardOverview).toHaveBeenCalledWith({
      rangeDays: 30,
      departments: [
        { id: 'dept-a', name: 'Alpha' },
        { id: 'dept-b', name: 'Beta' }
      ]
    })
    expect(res.body.range).toBe('30d')
  })

  test('filters departments for non-admin users', async () => {
    repo.dept.findAll.mockResolvedValue([
      { id: 'dept-a', name: 'Alpha' },
      { id: 'dept-b', name: 'Beta' }
    ])

    const handler = getRouteHandler()
    const req = {
      query: { range: '7' },
      user: { role: 'viewer', dept_ids: ['dept-b'] }
    }
    const res = createRes()

    await handler(req, res)

    expect(repo.log.getDashboardOverview).toHaveBeenCalledWith({
      rangeDays: 7,
      departments: [{ id: 'dept-b', name: 'Beta' }]
    })
    expect(res.body.range).toBe('7d')
  })
})
