const app = require('../src/app')

describe('app', () => {
  test('exports an Express app', () => {
    expect(typeof app).toBe('function')
    expect(typeof app.use).toBe('function')
  })
})
