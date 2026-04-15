jest.mock('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({
    getAccessToken: jest.fn().mockResolvedValue({ token: 'test-token' })
  }))
}))

const { buildCard } = require('../src/utils/chatCard')
const { stripInteractiveActions, parseServiceAccountJson, hasInteractiveActions, sendCard } = require('../src/utils/chatSend')

const dept = {
  id: 'dept-1',
  platform: 'github',
  lang: 'zh-TW',
  ev_allow_merge_btn: true,
  ev_allow_approve_btn: true,
  ev_allow_close_btn: true
}

const payload = {
  action: 'opened',
  pull_request: {
    number: 7,
    title: 'Fix bug',
    html_url: 'https://github.com/octocat/hello-world/pull/7',
    user: { login: 'alice' },
    head: { ref: 'fix' },
    base: { ref: 'main' }
  },
  repository: {
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    owner: { login: 'octocat' }
  }
}

describe('chatSend', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON
    global.fetch = jest.fn()
  })

  test('strips interactive action buttons for webhook delivery', () => {
    const card = buildCard(dept, payload)
    const sanitized = stripInteractiveActions(card)

    // All buttons with `action` (merge/approve/close) should be removed
    const actionButtons = sanitized.cardsV2[0].card.sections.flatMap(section =>
      section.widgets?.flatMap(widget => widget.buttonList?.buttons || []) || []
    ).filter(b => b.onClick?.action)
    expect(actionButtons).toHaveLength(0)

    // openLink buttons (view PR) should be preserved
    const linkButtons = sanitized.cardsV2[0].card.sections.flatMap(section =>
      section.widgets?.flatMap(widget => widget.buttonList?.buttons || []) || []
    ).filter(b => b.onClick?.openLink)
    expect(linkButtons).toHaveLength(1)
    expect(linkButtons[0].onClick.openLink.url).toBe('https://github.com/octocat/hello-world/pull/7')

    expect(sanitized.cardsV2[0].card.header.title).toContain('#7')
  })

  test('parses service account json with multiline private key', () => {
    const raw = '{"type":"service_account","private_key":"-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n","client_email":"bot@example.com"}'
    const parsed = parseServiceAccountJson(raw)

    expect(parsed.client_email).toBe('bot@example.com')
    expect(parsed.private_key).toContain('-----BEGIN PRIVATE KEY-----')
    expect(parsed.private_key).toContain('\nabc\n')
  })

  test('detects interactive action buttons', () => {
    const card = buildCard(dept, payload)
    expect(hasInteractiveActions(card)).toBe(true)
    expect(hasInteractiveActions(stripInteractiveActions(card))).toBe(false)
  })

  test('rejects interactive cards without space_name', async () => {
    const card = buildCard(dept, payload)
    await expect(sendCard('', 'https://example.com/webhook', card))
      .rejects
      .toThrow('Interactive Google Chat card requires space_name')
  })

  test('rejects webhook fallback when interactive Chat API delivery fails', async () => {
    process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'bot@example.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n'
    })
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'forbidden'
    })

    const card = buildCard(dept, payload)

    await expect(sendCard('spaces/AAAA', 'https://example.com/webhook', card))
      .rejects
      .toThrow('Google Chat API failed for interactive card (HTTP 403): forbidden')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toContain('https://chat.googleapis.com/v1/spaces/AAAA/messages')
  })
})
