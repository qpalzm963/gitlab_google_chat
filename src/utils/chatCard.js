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

function buildCard(dept, mrPayload) {
  const lang = dept.lang || 'zh-TW'
  const t = LABELS[lang] || LABELS['zh-TW']
  const action = mrPayload.object_attributes?.action || 'opened'
  const mr = mrPayload.object_attributes || {}
  const project = mrPayload.project || {}

  const title = t[action] || action
  const mrTitle = mr.title || '(no title)'
  const mrUrl = mr.url || project.web_url || ''
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

module.exports = { buildCard }
