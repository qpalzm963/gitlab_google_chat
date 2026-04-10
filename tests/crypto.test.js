process.env.ENCRYPTION_KEY = 'a'.repeat(64)

const { encrypt, decrypt } = require('../src/utils/crypto')

describe('crypto utils', () => {
  test('encrypt then decrypt returns original string', () => {
    const original = 'glpat-super-secret-token'
    const encrypted = encrypt(original)
    expect(encrypted).not.toBe(original)
    expect(decrypt(encrypted)).toBe(original)
  })

  test('each encrypt call produces different ciphertext (random IV)', () => {
    const original = 'same-input'
    expect(encrypt(original)).not.toBe(encrypt(original))
  })

  test('decrypt with tampered data throws', () => {
    const encrypted = encrypt('test')
    const tampered = encrypted.replace(/.$/, 'X')
    expect(() => decrypt(tampered)).toThrow()
  })
})
