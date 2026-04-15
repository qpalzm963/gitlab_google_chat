const { GoogleGenerativeAI } = require('@google/generative-ai')

const MODEL = 'gemini-2.0-flash'
const MAX_DIFF_CHARS = 12000  // ~3k tokens，避免超出限制
const TIMEOUT_MS = 15000

let _genAI = null

function getClient() {
  if (_genAI) return _genAI
  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  _genAI = new GoogleGenerativeAI(apiKey)
  return _genAI
}

/**
 * 取得 GitLab MR diff
 */
async function fetchGitlabDiff(baseUrl, projectId, mrIid, token) {
  const url = `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/diffs?per_page=20`
  const res = await fetch(url, {
    headers: { 'PRIVATE-TOKEN': token },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`GitLab diff fetch failed: HTTP ${res.status}`)
  const diffs = await res.json()
  return formatDiffs(diffs)
}

/**
 * 取得 GitHub PR diff
 */
async function fetchGithubDiff(owner, repo, prNumber, token) {
  const apiBase = (process.env.GITHUB_API_BASE_URL || 'https://api.github.com').trim()
  const url = `${apiBase}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=20`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`GitHub diff fetch failed: HTTP ${res.status}`)
  const files = await res.json()
  return formatGithubFiles(files)
}

function formatDiffs(diffs) {
  if (!Array.isArray(diffs) || diffs.length === 0) return ''
  return diffs.map(d => {
    const header = `### ${d.new_path || d.old_path}`
    const patch = d.diff || ''
    return `${header}\n${patch}`
  }).join('\n\n')
}

function formatGithubFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return ''
  return files.map(f => {
    const header = `### ${f.filename} (+${f.additions} -${f.deletions})`
    const patch = f.patch || '(binary or no patch)'
    return `${header}\n${patch}`
  }).join('\n\n')
}

/**
 * 用 Gemini 生成摘要
 */
async function generateSummary(title, description, diff, lang) {
  const client = getClient()
  const model = client.getGenerativeModel({ model: MODEL })

  const truncatedDiff = diff.length > MAX_DIFF_CHARS
    ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n...(diff truncated)'
    : diff

  const isZhTW = (lang || 'zh-TW') === 'zh-TW'
  const langInstruction = isZhTW
    ? '請用繁體中文回答。'
    : 'Please respond in English.'

  const prompt = `You are a code reviewer assistant. Summarize the following Merge Request changes concisely.
${langInstruction}

Rules:
- Maximum 3 bullet points
- Each bullet point is one short sentence
- Focus on WHAT changed and WHY it matters, not HOW
- Do not repeat the title
- Output only the bullet points, no headers or intro text

Title: ${title}
${description ? `Description: ${description}\n` : ''}
Diff:
${truncatedDiff || '(no diff available)'}`

  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), TIMEOUT_MS)
    )
  ])

  return result.response.text().trim()
}

/**
 * 主要入口：傳入 dept + payload，回傳摘要字串
 * 失敗時回傳 null（不影響主流程）
 */
async function getMrSummary(dept, payload, platform) {
  try {
    if (!process.env.GEMINI_API_KEY) return null

    let title = ''
    let description = ''
    let diff = ''

    if (platform === 'github') {
      const pr = payload.pull_request || {}
      const repo = payload.repository || {}
      title = pr.title || ''
      description = pr.body || ''
      if (!dept.github_token || !dept.github_owner || !dept.github_repo || !pr.number) return null
      diff = await fetchGithubDiff(dept.github_owner, dept.github_repo, pr.number, dept.github_token)
    } else {
      const mr = payload.object_attributes || {}
      const project = payload.project || {}
      title = mr.title || ''
      description = mr.description || ''
      if (!dept.gitlab_token || !dept.gitlab_base_url || !project.id || !mr.iid) return null
      diff = await fetchGitlabDiff(dept.gitlab_base_url, project.id, mr.iid, dept.gitlab_token)
    }

    const summary = await generateSummary(title, description, diff, dept.lang)
    return summary || null
  } catch (err) {
    console.error('[ai-summary] Failed:', err.message)
    return null
  }
}

module.exports = { getMrSummary }
