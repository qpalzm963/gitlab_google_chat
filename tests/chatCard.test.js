const { buildCard } = require('../src/utils/chatCard')

const baseDept = {
  id: 'dept-1',
  slug: 'backend', name: '後端工程', lang: 'zh-TW',
  ev_allow_merge_btn: true, ev_allow_approve_btn: false, ev_allow_close_btn: false
}

const baseMrPayload = {
  object_attributes: { action: 'opened', title: 'Fix bug', url: 'https://gitlab.com/mr/1', iid: 42, source_branch: 'fix', target_branch: 'main' },
  project: { id: 123, web_url: 'https://gitlab.com/proj' },
  user: { name: 'Alice' }
}

const basePrPayload = {
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

describe('chatCard', () => {
  const originalEndpoint = process.env.CHAT_BOT_ENDPOINT

  afterEach(() => {
    process.env.CHAT_BOT_ENDPOINT = originalEndpoint
  })

  test('produces cardsV2 structure', () => {
    const card = buildCard(baseDept, baseMrPayload)
    expect(card).toHaveProperty('cardsV2')
    expect(card).toHaveProperty('text')
    expect(card.cardsV2[0].card.header.title).toContain('Fix bug')
  })

  test('merge button shown when ev_allow_merge_btn=true', () => {
    const card = buildCard(baseDept, baseMrPayload)
    const buttons = card.cardsV2[0].card.sections.find(s => s.widgets?.[0]?.buttonList)?.widgets[0].buttonList.buttons
    expect(buttons.some(b => resolveMethod(b) === 'merge_mr')).toBe(true)
    expect(buttons.some(b => resolveMethod(b) === 'approve_mr')).toBe(false)
  })

  test('all buttons shown when all flags enabled', () => {
    const dept = { ...baseDept, ev_allow_approve_btn: true, ev_allow_close_btn: true }
    const card = buildCard(dept, baseMrPayload)
    const buttons = card.cardsV2[0].card.sections.find(s => s.widgets?.[0]?.buttonList)?.widgets[0].buttonList.buttons
    // view MR + merge + approve + close = 4
    expect(buttons).toHaveLength(4)
    expect(buttons.some(b => b.onClick?.openLink)).toBe(true)
  })

  test('no action buttons when all flags disabled (only view link)', () => {
    const dept = { ...baseDept, ev_allow_merge_btn: false }
    const card = buildCard(dept, baseMrPayload)
    const buttons = card.cardsV2[0].card.sections.find(s => s.widgets?.[0]?.buttonList)?.widgets[0].buttonList.buttons
    // only view MR link remains
    expect(buttons).toHaveLength(1)
    expect(buttons[0].onClick?.openLink?.url).toBe('https://gitlab.com/mr/1')
  })

  test('no button section when all flags disabled and no url', () => {
    const dept = { ...baseDept, ev_allow_merge_btn: false }
    const payloadNoUrl = { ...baseMrPayload, object_attributes: { ...baseMrPayload.object_attributes, url: '' } }
    const card = buildCard(dept, payloadNoUrl)
    const hasButtons = card.cardsV2[0].card.sections.some(s => s.widgets?.[0]?.buttonList)
    expect(hasButtons).toBe(false)
  })

  test('English language label', () => {
    const dept = { ...baseDept, lang: 'en' }
    const card = buildCard(dept, baseMrPayload)
    expect(card.cardsV2[0].card.header.subtitle).toBe('New MR')
  })

  test('GitHub PR payload produces PR card and parameters', () => {
    const dept = { ...baseDept, platform: 'github' }
    const card = buildCard(dept, basePrPayload)
    expect(card.text).toContain('[#7]')
    expect(card.cardsV2[0].card.header.title).toContain('#7')
    const buttons = card.cardsV2[0].card.sections.find(s => s.widgets?.[0]?.buttonList)?.widgets[0].buttonList.buttons
    const mergeBtn = buttons.find(b => resolveMethod(b) === 'merge_mr')
    const params = mergeBtn.onClick.action.parameters.reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {})
    expect(params.owner).toBe('octocat')
    expect(params.repo).toBe('hello-world')
    expect(params.pr_number).toBe('7')
  })

  test('close button hidden when MR is merged', () => {
    const dept = { ...baseDept, ev_allow_merge_btn: true, ev_allow_approve_btn: true, ev_allow_close_btn: true }
    const mergedPayload = { ...baseMrPayload, object_attributes: { ...baseMrPayload.object_attributes, action: 'merged' } }
    const card = buildCard(dept, mergedPayload)
    const buttons = card.cardsV2[0].card.sections.find(s => s.widgets?.[0]?.buttonList)?.widgets[0].buttonList.buttons
    expect(buttons.some(b => resolveMethod(b) === 'close_mr')).toBe(false)
    expect(buttons.some(b => resolveMethod(b) === 'merge_mr')).toBe(false)
    expect(buttons.some(b => resolveMethod(b) === 'approve_mr')).toBe(false)
    // only view link remains
    expect(buttons.some(b => b.onClick?.openLink)).toBe(true)
  })

  test('uses full callback URL and method param when CHAT_BOT_ENDPOINT is set', () => {
    process.env.CHAT_BOT_ENDPOINT = 'https://gitlabgooglechat.vercel.app/chat-callback'
    const card = buildCard(baseDept, baseMrPayload)
    const buttons = card.cardsV2[0].card.sections.find(s => s.widgets?.[0]?.buttonList)?.widgets[0].buttonList.buttons
    const mergeBtn = buttons.find(b => b.text.includes('Merge'))
    const params = mergeBtn.onClick.action.parameters.reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {})

    expect(mergeBtn.onClick.action.function).toBe('https://gitlabgooglechat.vercel.app/chat-callback')
    expect(params.method).toBe('merge_mr')
    expect(params.dept_id).toBe(baseDept.id)
  })
})

function resolveMethod(button) {
  const params = Array.isArray(button?.onClick?.action?.parameters) ? button.onClick.action.parameters : []
  return params.find(p => p.key === 'method')?.value || button?.onClick?.action?.function
}
