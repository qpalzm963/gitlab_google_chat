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
    close: '❌ Close MR'
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
    close: '❌ Close MR'
  }
}

function isGithubPrPayload(payload) {
  return !!(payload && payload.pull_request && payload.repository)
}

function buildCard(dept, payload) {
  const lang = dept.lang || 'zh-TW'
  const t = LABELS[lang] || LABELS['zh-TW']
  if (isGithubPrPayload(payload)) {
    return buildGithubPrCard(dept, payload, t)
  }
  return buildGitlabMrCard(dept, payload, t)
}

function buildGitlabMrCard(dept, mrPayload, t) {
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
    }
  ]

  // 按鈕區塊（依開關決定顯示）
  const buttons = []

  if (dept.ev_allow_merge_btn) {
    buttons.push({
      text: t.merge,
      onClick: {
        action: {
          function: 'merge_mr',
          parameters: [
            { key: 'project_id', value: String(projectId) },
            { key: 'mr_iid', value: String(mrIid) },
            { key: 'dept_id', value: dept.id }
          ]
        }
      }
    })
  }

  if (dept.ev_allow_approve_btn) {
    buttons.push({
      text: t.approve,
      onClick: {
        action: {
          function: 'approve_mr',
          parameters: [
            { key: 'project_id', value: String(projectId) },
            { key: 'mr_iid', value: String(mrIid) },
            { key: 'dept_id', value: dept.id }
          ]
        }
      }
    })
  }

  if (dept.ev_allow_close_btn) {
    buttons.push({
      text: t.close,
      onClick: {
        action: {
          function: 'close_mr',
          parameters: [
            { key: 'project_id', value: String(projectId) },
            { key: 'mr_iid', value: String(mrIid) },
            { key: 'dept_id', value: dept.id }
          ]
        }
      }
    })
  }

  if (buttons.length > 0) {
    sections.push({ widgets: [{ buttonList: { buttons } }] })
  }

  return {
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

function buildGithubPrCard(dept, payload, t) {
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
    }
  ]

  const buttons = []

  if (dept.ev_allow_merge_btn) {
    buttons.push({
      text: t.merge,
      onClick: {
        action: {
          function: 'merge_mr',
          parameters: [
            { key: 'owner', value: String(owner) },
            { key: 'repo', value: String(repoName) },
            { key: 'pr_number', value: String(prNumber) },
            { key: 'dept_id', value: dept.id }
          ]
        }
      }
    })
  }

  if (dept.ev_allow_approve_btn) {
    buttons.push({
      text: t.approve,
      onClick: {
        action: {
          function: 'approve_mr',
          parameters: [
            { key: 'owner', value: String(owner) },
            { key: 'repo', value: String(repoName) },
            { key: 'pr_number', value: String(prNumber) },
            { key: 'dept_id', value: dept.id }
          ]
        }
      }
    })
  }

  if (dept.ev_allow_close_btn) {
    buttons.push({
      text: t.close,
      onClick: {
        action: {
          function: 'close_mr',
          parameters: [
            { key: 'owner', value: String(owner) },
            { key: 'repo', value: String(repoName) },
            { key: 'pr_number', value: String(prNumber) },
            { key: 'dept_id', value: dept.id }
          ]
        }
      }
    })
  }

  if (buttons.length > 0) {
    sections.push({ widgets: [{ buttonList: { buttons } }] })
  }

  return {
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
