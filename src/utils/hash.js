const crypto = require('crypto')

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

function buildPayloadHash(eventUUID, deptId) {
  return sha256(`${eventUUID}:${deptId}`)
}

module.exports = { sha256, buildPayloadHash }
