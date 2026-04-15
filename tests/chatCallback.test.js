// Mock JWT verification to succeed by default
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({ payload: { email: 'chat@system.gserviceaccount.com' } })
  }))
}))

jest.mock('../src/repositories', () => ({
  dept: {
    findById: jest.fn()
  }
}))

const repo = require('../src/repositories')
const router = require('../src/routes/chatCallback')

function getRouteHandler(method, path) {
  const layer = router.stack.find(entry => entry.route?.path === path && entry.route.methods?.[method])
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

function makeReq(body, extraHeaders = {}) {
  return {
    body,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer fake-jwt-token',
      'user-agent': 'jest',
      ...extraHeaders
    }
  }
}

describe('chatCallback routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  test('POST / returns 403 when no authorization header', async () => {
    const handler = getRouteHandler('post', '/')
    const req = {
      body: { common: { invokedFunction: 'ping_test', parameters: [] } },
      headers: { 'content-type': 'application/json' }
    }
    const res = createRes()

    await handler(req, res)

    expect(res.statusCode).toBe(403)
  })

  test('POST / responds to ping_test', async () => {
    const handler = getRouteHandler('post', '/')
    const req = makeReq({
      type: 'CARD_CLICKED',
      common: {
        invokedFunction: 'ping_test',
        parameters: [{ key: 'dept_id', value: 'dept-1' }]
      }
    })
    const res = createRes()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ text: 'pong from /chat-callback' })
  })

  test('POST / reads action from commonEventObject parameters', async () => {
    const handler = getRouteHandler('post', '/')
    const req = makeReq({
      commonEventObject: {
        parameters: {
          method: 'ping_test',
          dept_id: 'dept-1'
        }
      }
    })
    const res = createRes()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      hostAppDataAction: {
        chatDataAction: {
          createMessageAction: {
            message: { text: 'pong from /chat-callback' }
          }
        }
      }
    })
  })

  test('POST / returns error when dept not found', async () => {
    repo.dept.findById.mockResolvedValue(null)
    const handler = getRouteHandler('post', '/')
    const req = makeReq({
      action: {
        function: 'merge_mr',
        parameters: [
          { key: 'method', value: 'merge_mr' },
          { key: 'dept_id', value: 'nonexistent' },
          { key: 'project_id', value: '1' },
          { key: 'mr_iid', value: '1' }
        ]
      }
    })
    const res = createRes()

    await handler(req, res)

    expect(res.body.text).toContain('找不到部門設定')
  })
})
