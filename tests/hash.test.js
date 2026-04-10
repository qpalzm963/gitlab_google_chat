const { sha256, buildPayloadHash } = require('../src/utils/hash')

describe('hash utils', () => {
  test('sha256 produces fixed-length 64-char hex', () => {
    expect(sha256('hello')).toHaveLength(64)
  })

  test('same input always produces same hash', () => {
    expect(sha256('test')).toBe(sha256('test'))
  })

  test('different inputs produce different hashes', () => {
    expect(sha256('a')).not.toBe(sha256('b'))
  })

  test('buildPayloadHash combines eventUUID and deptId', () => {
    const h1 = buildPayloadHash('uuid-1', 'dept-1')
    const h2 = buildPayloadHash('uuid-1', 'dept-2')
    const h3 = buildPayloadHash('uuid-1', 'dept-1')
    expect(h1).not.toBe(h2)
    expect(h1).toBe(h3)
  })
})
