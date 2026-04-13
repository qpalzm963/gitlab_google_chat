const { buildCard } = require('../src/utils/chatCard')

const baseDept = {
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
  test('produces cardsV2 structure', () => {
    const card = buildCard(baseDept, baseMrPayload)
    expect(card).toHaveProperty('cardsV2')
    expect(card.cardsV2[0].card.header.title).toContain('Fix bug')
  })

  test('merge button shown when ev_allow_merge_btn=true', () => {
    const card = buildCard(baseDept, baseMrPayload)
    const buttons = card.cardsV2[0].card.sections.find(s => s.widgets?.[0]?.buttonList)?.widgets[0].buttonList.buttons
    expect(buttons.some(b => b.onClick.action.function === 'merge_mr')).toBe(true)
    expect(buttons.some(b => b.onClick.action.function === 'approve_mr')).toBe(false)
  })

  test('all buttons shown when all flags enabled', () => {
    const dept = { ...baseDept, ev_allow_approve_btn: true, ev_allow_close_btn: true }
    const card = buildCard(dept, baseMrPayload)
    const buttons = card.cardsV2[0].card.sections.find(s => s.widgets?.[0]?.buttonList)?.widgets[0].buttonList.buttons
    expect(buttons).toHaveLength(3)
  })

  test('no button section when all flags disabled', () => {
    const dept = { ...baseDept, ev_allow_merge_btn: false }
    const card = buildCard(dept, baseMrPayload)
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
    expect(card.cardsV2[0].card.header.title).toContain('#7')
    const buttons = card.cardsV2[0].card.sections.find(s => s.widgets?.[0]?.buttonList)?.widgets[0].buttonList.buttons
    const mergeBtn = buttons.find(b => b.onClick.action.function === 'merge_mr')
    const params = mergeBtn.onClick.action.parameters.reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {})
    expect(params.owner).toBe('octocat')
    expect(params.repo).toBe('hello-world')
    expect(params.pr_number).toBe('7')
  })
})
