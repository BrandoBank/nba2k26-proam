/**
 * parse-screenshot — Netlify Function
 *
 * POST { image_base64: string, media_type?: string }
 * → structured box score JSON parsed by Claude vision + extended thinking
 *
 * Security:
 *   - Rate limited: 10 requests / 60s per IP (AI call is expensive)
 *   - Payload capped at 10 MB (base64 image)
 *   - media_type allowlisted to image/* only
 *   - image_base64 validated as legal base64 before forwarding to Anthropic
 *   - ANTHROPIC_API_KEY never leaves this function
 */

const Anthropic = require('@anthropic-ai/sdk')

// ── Rate limit (CommonJS-compatible inline, _ratelimit.js is ESM) ─────────────
const _rlStore = new Map()
function _rateLimit(ip, windowMs = 60_000, max = 10) {
  const now = Date.now()
  const key = ip || 'unknown'
  if (!_rlStore.has(key)) { _rlStore.set(key, { count: 1, start: now }); return true }
  const e = _rlStore.get(key)
  if (now - e.start > windowMs) { _rlStore.set(key, { count: 1, start: now }); return true }
  e.count++
  return e.count <= max
}
function _getIp(headers) {
  return headers['x-nf-client-connection-ip'] || headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
}

// ── Allowed image types ───────────────────────────────────────────────────────
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])

// ── Max base64 payload ~10 MB (raw image ~7.5 MB) ────────────────────────────
const MAX_B64_CHARS = 14_000_000

const SYSTEM_PROMPT = `You are an expert at parsing NBA 2K26 Pro-Am box score screenshots.

The box score shows two teams. Each team has exactly 5 players listed top-to-bottom: PG, SG, SF, PF, C.

The stat columns are (left to right):
GRADE | PTS | REB | AST | STL | BLK | PF | TO | FGM-FGA | 3PM-3PA | FTM-FTA

The bottom team also has a "YOUR MATCHUP" column showing their defensive assignment.

Your job: extract every stat cell precisely. Take your time on ambiguous characters:
- The number 1 vs lowercase l vs uppercase I — look at font context
- 0 vs O — box scores use digits only in stat columns
- Gamertags may contain numbers, underscores, capitals — copy exactly
- FG/3P/FT columns show "X/Y" format — split into made (fgm/tpm/ftm) and attempted (fga/tpa/fta)
- Blank or "--" cells = 0
- Grade column shows A+, A, A-, B+, B, etc. or null

Return ONLY a valid JSON object matching this exact schema — no markdown, no explanation:

{
  "team_top": {
    "name": "<team name>",
    "score": <integer>,
    "players": [
      {
        "position_slot": 1,
        "gamertag": "<exact gamertag>",
        "grade": "<letter grade or null>",
        "pts": <int>, "reb": <int>, "ast": <int>,
        "stl": <int>, "blk": <int>, "fouls": <int>, "tov": <int>,
        "fgm": <int>, "fga": <int>,
        "tpm": <int>, "tpa": <int>,
        "ftm": <int>, "fta": <int>
      }
    ]
  },
  "team_bottom": {
    "name": "<team name>",
    "score": <integer>,
    "players": [
      {
        "position_slot": 1,
        "gamertag": "<exact gamertag>",
        "grade": "<letter grade or null>",
        "pts": <int>, "reb": <int>, "ast": <int>,
        "stl": <int>, "blk": <int>, "fouls": <int>, "tov": <int>,
        "fgm": <int>, "fga": <int>,
        "tpm": <int>, "tpa": <int>,
        "ftm": <int>, "fta": <int>,
        "matchup_gamertag": "<opponent gamertag from YOUR MATCHUP column, or null>"
      }
    ]
  },
  "total_check": {
    "team_top_pts_sum": <sum of top team player pts>,
    "team_bottom_pts_sum": <sum of bottom team player pts>
  }
}`

exports.handler = async (event) => {
  // ── Method guard ────────────────────────────────────────────────────────────
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = _getIp(event.headers)
  if (!_rateLimit(ip)) {
    return { statusCode: 429, headers: { 'Retry-After': '60' }, body: JSON.stringify({ error: 'Too many requests. Try again in a minute.' }) }
  }

  // ── API key presence ────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfiguration' }) }
  }

  // ── Payload size guard (before JSON.parse) ──────────────────────────────────
  if (event.body && event.body.length > MAX_B64_CHARS + 200) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Payload too large. Max image size ~7.5 MB.' }) }
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { image_base64, media_type = 'image/jpeg' } = body

  // ── Input validation ────────────────────────────────────────────────────────
  if (!image_base64 || typeof image_base64 !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'image_base64 (string) required' }) }
  }
  if (image_base64.length > MAX_B64_CHARS) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Image too large' }) }
  }
  if (!ALLOWED_TYPES.has(media_type)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid media_type. Allowed: ${[...ALLOWED_TYPES].join(', ')}` }) }
  }
  // Validate base64 characters (no script injection via image field)
  if (!/^[A-Za-z0-9+/=]+$/.test(image_base64)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'image_base64 contains invalid characters' }) }
  }

  // ── Call Claude ─────────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      thinking: { type: 'enabled', budget_tokens: 5000 },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: 'Parse every stat from this NBA 2K26 box score screenshot. Think carefully through any ambiguous characters before returning the JSON.' },
          ],
        },
        {
          // Prefill — forces pure JSON from token 1
          role: 'assistant',
          content: '{',
        },
      ],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    if (!textBlock) throw new Error('No text output from model')

    const raw = '{' + textBlock.text.trim()
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(parsed),
    }
  } catch (err) {
    console.error('parse-screenshot error:', err.message)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Parsing failed. Try a clearer screenshot.' }),
    }
  }
}
