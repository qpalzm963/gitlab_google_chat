const { randomSecret } = require('../src/utils/random')

describe('random utils', () => {
  test('randomSecret returns 64-char hex string by default (32 bytes)', () => {
    expect(randomSecret()).toHaveLength(64)
  })

  test('each call returns different value', () => {
    expect(randomSecret()).not.toBe(randomSecret())
  })

  test('custom byte length works', () => {
    expect(randomSecret(16)).toHaveLength(32)
  })
})
