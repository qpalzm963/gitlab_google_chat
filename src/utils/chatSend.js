const { JWT } = require('google-auth-library')

let _client = null

function getAuthClient() {
  if (_client) return _client
  const raw = process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_CHAT_SERVICE_ACCOUNT_JSON is not set')
  const creds = parseServiceAccountJson(raw)
  _client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/chat.bot']
  })
  return _client
}

function parseServiceAccountJson(raw) {
  try {
    return JSON.parse(raw)
  } catch (err) {
    const repaired = repairServiceAccountJson(raw)
    if (repaired !== raw) return JSON.parse(repaired)
    throw err
  }
}

function repairServiceAccountJson(raw) {
  if (typeof raw !== 'string') return raw
  return raw.replace(
    /"private_key":"([\s\S]*?)","client_email":/,
    (_, privateKey) => `"private_key":"${escapeJsonString(privateKey)}","client_email":`
  )
}

function escapeJsonString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"')
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
 * Update an existing Google Chat message in-place via Chat API.
 * messageName: e.g. "spaces/XXX/messages/YYY"
 */
async function updateCard(messageName, card) {
  const client = getAuthClient()
  const { token } = await client.getAccessToken()
  const url = `https://chat.googleapis.com/v1/${messageName}?updateMask=text,cardsV2`
  return fetch(url, {
    method: 'PATCH',
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
  const payload = stripInteractiveActions(card)
  return fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  })
}

function hasInteractiveActions(card) {
  if (!card || !Array.isArray(card.cardsV2)) return false

  return card.cardsV2.some(entry => {
    const sections = Array.isArray(entry?.card?.sections) ? entry.card.sections : []
    return sections.some(section => {
      const widgets = Array.isArray(section?.widgets) ? section.widgets : []
      return widgets.some(widget => {
        const buttons = Array.isArray(widget?.buttonList?.buttons) ? widget.buttonList.buttons : []
        return buttons.some(button => Boolean(button?.onClick?.action))
      })
    })
  })
}

function stripInteractiveActions(card) {
  if (!card || !Array.isArray(card.cardsV2)) return card

  const cardsV2 = card.cardsV2
    .map(entry => {
      const sections = Array.isArray(entry?.card?.sections) ? entry.card.sections : []
      const sanitizedSections = sections
        .map(section => {
          const widgets = Array.isArray(section?.widgets) ? section.widgets : []
          const sanitizedWidgets = widgets
            .map(widget => {
              if (!widget?.buttonList?.buttons) return widget

              const buttons = widget.buttonList.buttons.filter(button => {
                const onClick = button?.onClick || {}
                return Boolean(onClick.openLink)
              })

              if (buttons.length === 0) return null
              return {
                ...widget,
                buttonList: {
                  ...widget.buttonList,
                  buttons
                }
              }
            })
            .filter(Boolean)

          if (sanitizedWidgets.length === 0) return null
          return {
            ...section,
            widgets: sanitizedWidgets
          }
        })
        .filter(Boolean)

      return {
        ...entry,
        card: {
          ...entry.card,
          sections: sanitizedSections
        }
      }
    })
    .filter(Boolean)

  return {
    ...card,
    cardsV2
  }
}

/**
 * Send card to Google Chat.
 * Prefers Chat API (spaceName) for interactive buttons.
 * Falls back to webhookUrl if spaceName or SA credentials are unavailable.
 */
async function sendCard(spaceName, webhookUrl, card) {
  const normalizedSpaceName = typeof spaceName === 'string' ? spaceName.trim() : spaceName
  const interactive = hasInteractiveActions(card)

  if (interactive && !normalizedSpaceName) {
    throw new Error('Interactive Google Chat card requires space_name; incoming webhook cannot handle button callbacks')
  }

  if (interactive && !process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON) {
    throw new Error('Interactive Google Chat card requires GOOGLE_CHAT_SERVICE_ACCOUNT_JSON; refusing webhook fallback')
  }

  if (normalizedSpaceName && process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON) {
    try {
      const res = await sendViaApi(normalizedSpaceName, card)
      const bodyText = await res.text()
      const bodyJson = tryParseJson(bodyText)
      if (res.ok) {
        return {
          response: res,
          transport: 'chat_api',
          bodyText,
          bodyJson
        }
      }
      let body = ''
      body = bodyText
      if (interactive) {
        throw new Error(`Google Chat API failed for interactive card (HTTP ${res.status}): ${(body || '').slice(0, 500)}`)
      }
      console.error(
        '[chat-send] Chat API failed (HTTP %s). Falling back to incoming webhook. body=%s',
        res.status,
        (body || '').slice(0, 500)
      )
    } catch (err) {
      if (interactive) throw err
      console.error('[chat-send] Chat API error. Falling back to incoming webhook. err=%s', err?.message || String(err))
    }
  }
  const webhookRes = await sendViaWebhook(webhookUrl, card)
  const bodyText = await webhookRes.text()
  const bodyJson = tryParseJson(bodyText)
  return {
    response: webhookRes,
    transport: 'incoming_webhook',
    bodyText,
    bodyJson
  }
}

function tryParseJson(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

module.exports = { sendCard, updateCard, stripInteractiveActions, parseServiceAccountJson, hasInteractiveActions }
