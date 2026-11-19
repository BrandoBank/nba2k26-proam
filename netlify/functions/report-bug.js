import { getCaller, json } from '../lib/shared.js'
import { rateLimit, rateLimitResponse } from '../lib/ratelimit.js'

const ISSUES_URL = 'https://api.github.com/repos/BrandoBank/nba2k26-proam/issues'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FAILURE = 'Could not send your bug report. Please try again later.'

function clean(value, max) {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n')
      .replace(/\p{Cc}/gu, char => char === '\n' || char === '\t' ? char : '')
      .trim().slice(0, max).replace(/@/g, '＠')
    : ''
}

// Indented code blocks keep all reporter-controlled text literal, including fences and HTML.
function section(title, value) {
  return `## ${title}\n\n${(value || 'Not provided').split('\n').map(line => `    ${line}`).join('\n')}`
}

function pageUrl(value) {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return ''
    return clean(`${url.origin}${url.pathname}`, 2000)
  } catch {
    return ''
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const caller = await getCaller(req)
  if (caller.error) return caller.error

  const rl = rateLimit(`report-bug:${caller.user.id}`, { windowMs: 10 * 60_000, max: 5 })
  if (!rl.allowed) return rateLimitResponse(rl.resetMs)

  let body
  try {
    const text = await req.text()
    if (text.length > 24_000) return json(413, { error: 'Bug report is too large' })
    body = JSON.parse(text)
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'Invalid bug report' })
  }
  const happened = clean(body.happened, 4000)
  if (!happened) return json(400, { error: 'Tell us what happened' })
  if (!process.env.GITHUB_ISSUES_TOKEN) return json(503, { error: FAILURE })

  const viewport = body.viewport
  const dimension = value => Number.isInteger(value) && value > 0 && value <= 100_000
  const size = viewport && dimension(viewport.width) && dimension(viewport.height)
    ? `${viewport.width} × ${viewport.height}` : ''
  const url = pageUrl(body.page_url)
  const route = clean(body.route, 2000).split(/[?#]/)[0]
  const issueBody = [
    section('What happened', happened),
    section('What was expected', clean(body.expected, 4000)),
    section('Reporter gamertag', clean(caller.player.gamertag, 100)),
    section('Page URL (query and fragment omitted)', url),
    section('Route', route),
    section('Browser / device (user agent)', clean(req.headers.get('user-agent'), 1000)),
    section('Viewport', size),
    section('App version (deploy commit)', clean(body.app_version, 100)),
    section('Series ID', typeof body.series_id === 'string' && UUID.test(body.series_id) ? body.series_id : ''),
    section('Submission ID', typeof body.submission_id === 'string' && UUID.test(body.submission_id) ? body.submission_id : ''),
  ].join('\n\n')

  try {
    const response = await fetch(ISSUES_URL, {
      method: 'POST',
      headers: {
        Authorization: ['Bearer', process.env.GITHUB_ISSUES_TOKEN].join(' '),
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: `Bug report: ${happened.split('\n')[0].slice(0, 100)}`,
        body: issueBody,
        labels: ['bug-report'],
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return json(502, { error: FAILURE })
    const issue = await response.json()
    if (!Number.isSafeInteger(issue.number) || issue.number < 1) return json(502, { error: FAILURE })
    return json(201, {
      issue_number: issue.number,
      issue_url: `https://github.com/BrandoBank/nba2k26-proam/issues/${issue.number}`,
    })
  } catch {
    return json(502, { error: FAILURE })
  }
}
