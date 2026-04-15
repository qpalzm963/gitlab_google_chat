const LABELS = {
  'zh-TW': {
    opened: '新增 MR',
    updated: 'MR 已更新',
    merged: 'MR 已合併',
    closed: 'MR 已關閉',
    author: '作者',
    branch: '分支',
    merge: '✅ Merge',
    approve: '👍 Approve',
    close: '❌ Close MR',
    viewMr: '🔗 查看 MR',
    viewPr: '🔗 查看 PR',
    aiSummary: '🤖 AI 摘要'
  },
  en: {
    opened: 'New MR',
    updated: 'MR Updated',
    merged: 'MR Merged',
    closed: 'MR Closed',
    author: 'Author',
    branch: 'Branch',
    merge: '✅ Merge',
    approve: '👍 Approve',
    close: '❌ Close MR',
    viewMr: '🔗 View MR',
    viewPr: '🔗 View PR',
    aiSummary: '🤖 AI Summary'
  }
}

function isGithubPrPayload(payload) {
  return !!(payload && payload.pull_request && payload.repository)
}

function buildChatAction(method, params) {
  const actionUrl = (process.env.CHAT_BOT_ENDPOINT || '').trim()
  const parameters = [
    { key: 'method', value: method },
    ...params
  ]

  if (actionUrl) {
    return {
      function: actionUrl,
      parameters
    }
  }

  return {
    function: method,
    parameters: params
  }
}

function buildCard(dept, payload, { summary } = {}) {
  const lang = dept.lang || 'zh-TW'
  const t = LABELS[lang] || LABELS['zh-TW']
  if (isGithubPrPayload(payload)) {
    return buildGithubPrCard(dept, payload, t, summary)
  }
  return buildGitlabMrCard(dept, payload, t, summary)
}

function buildSummarySection(t, summary) {
  if (!summary) return null
  return {
    widgets: [
      {
        decoratedText: {
          topLabel: t.aiSummary,
          text: summary,
          wrapText: true
        }
      }
    ]
  }
}

function buildGitlabMrCard(dept, mrPayload, t, summary) {
  const action = mrPayload.object_attributes?.action || 'opened'
  const mr = mrPayload.object_attributes || {}
  const project = mrPayload.project || {}

  const title = t[action] || action
  const mrTitle = mr.title || '(no title)'
  const authorName = mrPayload.user?.name || mr.last_commit?.author?.name || 'Unknown'
  const sourceBranch = mr.source_branch || ''
  const targetBranch = mr.target_branch || ''
  const mrIid = mr.iid || ''
  const projectId = project.id || ''
  const mrUrl = mr.url || ''

  const isClosed = action === 'merged' || action === 'closed'

  const summarySection = buildSummarySection(t, summary)

  const sections = [
    {
      widgets: [
        {
          decoratedText: {
            topLabel: t.author,
            text: authorName
          }
        },
        {
          decoratedText: {
            topLabel: t.branch,
            text: `${sourceBranch} → ${targetBranch}`
          }
        }
      ]
    },
    ...(summarySection ? [summarySection] : [])
  ]

  // 按鈕區塊（依開關決定顯示）
  const buttons = []

  if (mrUrl) {
    buttons.push({
      text: t.viewMr,
      onClick: { openLink: { url: mrUrl } }
    })
  }

  if (dept.ev_allow_merge_btn && !isClosed) {
    buttons.push({
      text: t.merge,
      onClick: {
        action: {
          ...buildChatAction('merge_mr', [
            { key: 'project_id', value: String(projectId) },
            { key: 'mr_iid', value: String(mrIid) },
            { key: 'dept_id', value: dept.id }
          ])
        }
      }
    })
  }

  if (dept.ev_allow_approve_btn && !isClosed) {
    buttons.push({
      text: t.approve,
      onClick: {
        action: {
          ...buildChatAction('approve_mr', [
            { key: 'project_id', value: String(projectId) },
            { key: 'mr_iid', value: String(mrIid) },
            { key: 'dept_id', value: dept.id }
          ])
        }
      }
    })
  }

  if (dept.ev_allow_close_btn && !isClosed) {
    buttons.push({
      text: t.close,
      onClick: {
        action: {
          ...buildChatAction('close_mr', [
            { key: 'project_id', value: String(projectId) },
            { key: 'mr_iid', value: String(mrIid) },
            { key: 'dept_id', value: dept.id }
          ])
        }
      }
    })
  }

  if (buttons.length > 0) {
    sections.push({ widgets: [{ buttonList: { buttons } }] })
  }

  return {
    text: `${title} [!${mrIid}] ${mrTitle} (${sourceBranch} -> ${targetBranch})`,
    cardsV2: [
      {
        cardId: `mr-${projectId}-${mrIid}`,
        card: {
          header: {
            title: `[!${mrIid}] ${mrTitle}`,
            subtitle: title,
            imageUrl: 'https://about.gitlab.com/images/press/logo/png/gitlab-icon-rgb.png',
            imageType: 'CIRCLE'
          },
          sections
        }
      }
    ]
  }
}

function buildGithubPrCard(dept, payload, t, summary) {
  const action = normalizeGithubPrAction(payload?.action, payload?.pull_request)
  const title = t[action] || action

  const pr = payload.pull_request || {}
  const repo = payload.repository || {}
  const owner = repo?.owner?.login || ''
  const repoName = repo?.name || ''
  const prNumber = pr.number || ''
  const prTitle = pr.title || '(no title)'
  const authorName = pr?.user?.login || pr?.user?.name || 'Unknown'
  const sourceBranch = pr?.head?.ref || ''
  const targetBranch = pr?.base?.ref || ''
  const prUrl = pr.html_url || ''

  const isClosed = action === 'merged' || action === 'closed'

  const summarySection = buildSummarySection(t, summary)

  const sections = [
    {
      widgets: [
        {
          decoratedText: {
            topLabel: t.author,
            text: authorName
          }
        },
        {
          decoratedText: {
            topLabel: t.branch,
            text: `${sourceBranch} → ${targetBranch}`
          }
        }
      ]
    },
    ...(summarySection ? [summarySection] : [])
  ]

  const buttons = []

  if (prUrl) {
    buttons.push({
      text: t.viewPr,
      onClick: { openLink: { url: prUrl } }
    })
  }

  if (dept.ev_allow_merge_btn && !isClosed) {
    buttons.push({
      text: t.merge,
      onClick: {
        action: {
          ...buildChatAction('merge_mr', [
            { key: 'owner', value: String(owner) },
            { key: 'repo', value: String(repoName) },
            { key: 'pr_number', value: String(prNumber) },
            { key: 'dept_id', value: dept.id }
          ])
        }
      }
    })
  }

  if (dept.ev_allow_approve_btn && !isClosed) {
    buttons.push({
      text: t.approve,
      onClick: {
        action: {
          ...buildChatAction('approve_mr', [
            { key: 'owner', value: String(owner) },
            { key: 'repo', value: String(repoName) },
            { key: 'pr_number', value: String(prNumber) },
            { key: 'dept_id', value: dept.id }
          ])
        }
      }
    })
  }

  if (dept.ev_allow_close_btn && !isClosed) {
    buttons.push({
      text: t.close,
      onClick: {
        action: {
          ...buildChatAction('close_mr', [
            { key: 'owner', value: String(owner) },
            { key: 'repo', value: String(repoName) },
            { key: 'pr_number', value: String(prNumber) },
            { key: 'dept_id', value: dept.id }
          ])
        }
      }
    })
  }

  if (buttons.length > 0) {
    sections.push({ widgets: [{ buttonList: { buttons } }] })
  }

  return {
    text: `${title} [#${prNumber}] ${prTitle} (${sourceBranch} -> ${targetBranch})`,
    cardsV2: [
      {
        cardId: `pr-${owner}-${repoName}-${prNumber}`,
        card: {
          header: {
            title: `[#${prNumber}] ${prTitle}`,
            subtitle: title,
            imageUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
            imageType: 'CIRCLE'
          },
          sections
        }
      }
    ]
  }
}

function normalizeGithubPrAction(action, pr) {
  if (action === 'opened') return 'opened'
  if (action === 'synchronize') return 'updated'
  if (action === 'closed') return pr?.merged ? 'merged' : 'closed'
  return action || 'opened'
}

module.exports = { buildCard }
