const { JWT } = require('google-auth-library')

let _client = null

function getAuthClient() {
  if (_client) return _client
  const raw = process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_CHAT_SERVICE_ACCOUNT_JSON is not set')
  const creds = JSON.parse(raw)
  _client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/chat.bot']
  })
  return _client
}

/**
 * Send a card via Google Chat API (Service Account).
 * Returns a fetch Response.
 * Throws if the service account env var is missing or auth fails.
 */
async function sendViaApi(spaceName, card) {
  const client = getAuthClient()
  const { token } = await client.getAccessToken()
  const url = `https://chat.googleapis.com/v1/${spaceName}/messages`
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(card),
    signal: AbortSignal.timeout(10000)
  })
}

/**
 * Send via Incoming Webhook (no interactivity, but no service account needed).
 */
async function sendViaWebhook(webhookUrl, card) {
  return fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
    signal: AbortSignal.timeout(10000)
  })
}

/**
 * Send card to Google Chat.
 * Prefers Chat API (spaceName) for interactive buttons.
 * Falls back to webhookUrl if spaceName or SA credentials are unavailable.
 */
async function sendCard(spaceName, webhookUrl, card) {
  if (spaceName && process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON) {
    return sendViaApi(spaceName, card)
  }
  return sendViaWebhook(webhookUrl, card)
}

module.exports = { sendCard }
