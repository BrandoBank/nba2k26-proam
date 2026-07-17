/**
 * rank-series — Netlify serverless function
 *
 * POST { series_id, stats, series_info }
 * → { rankings, awards }
 *
 * Security:
 *   - Rate limited: 5 requests / 60s per IP
 *   - series_id validated as UUID
 *   - stats array capped at 20 players max
 *   - stat fields stripped to known-safe keys before forwarding to Claude
 *   - ANTHROPIC_API_KEY never reaches the client
 */

import Anthropic from '@anthropic-ai/sdk'

// ── Rate limiter ──────────────────────────────────────────────────────────────
const _rlStore = new Map()
function _rateLimit(ip, windowMs = 60_000, max = 5) {
  const now = Date.now()
  const key = ip || 'unknown'
  if (!_rlStore.has(key)) { _rlStore.set(key, { count: 1, start: now }); return true }
  const e = _rlStore.get(key)
  if (now - e.start > windowMs) { _rlStore.set(key, { count: 1, start: now }); return true }
  e.count++
  return e.count <= max
}
function _getIp(req) {
  return req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

// ── UUID validator ────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Allowed stat keys forwarded to Claude (prevent prompt injection via stat fields) ──
const SAFE_STAT_KEYS = new Set([
  'gamertag', 'display_name', 'primary_side', 'gp', 'ppg', 'rpg', 'apg',
  'spg', 'bpg', 'tovpg', 'fg_pct', 'three_pct', 'total_tpa', 'total_fga',
  'best_pts', 'is_swing',
])

function sanitizeStats(stats) {
  return stats.map(p => {
    const safe = {}
    for (const key of SAFE_STAT_KEYS) {
      if (key in p) safe[key] = p[key]
    }
    // Clamp numeric fields to reasonable ranges
    for (const k of ['gp', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'tovpg', 'fg_pct', 'three_pct', 'total_tpa', 'total_fga', 'best_pts']) {
      if (k in safe && typeof safe[k] === 'number') {
        safe[k] = Math.max(0, Math.min(safe[k], 9999))
      }
    }
    return safe
  })
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are an expert NBA 2K Pro-Am series analyst. You receive player stats from a completed series and output tier rankings plus award nominations.

## TIER DEFINITIONS

ELITE — Series-defining performance. A player whose impact swung games. Think dominant scorer, lockdown defender, or engine of the offense. Not just good numbers — they changed outcomes.

STRONG — Real two-way contributor or elite specialist. Either genuinely effective on both ends OR the best in the lobby at one thing (shooting, playmaking, rim protection). Solid in their role, hurt opponents, didn't hurt their team.

SOLID — Reliable role production. Did their job. Showed up, played their position, contributed without being a liability. Missing a stat category is fine if their role didn't require it. A rebounder with 0 assists is SOLID if they grabbed boards. Low-scoring nights on hard defensive assignments belong here, not lower.

G TIER — Only one player per lobby should ever be G TIER unless truly warranted. G TIER means they actively made their team worse — high turnovers, bad shooting with high volume, invisible on defense AND offense. Do NOT put role-limited players here for missing stat categories. Do NOT overuse this tier. Reserve it for the single worst player who genuinely hurt their squad.

## SCORING FACTORS

1. Efficiency — FG% and 3P% (with sufficient attempts, min 3 TPA for 3P to count). Context matters: sometimes a low FG% reflects taking tough contested shots as a secondary scorer.
2. Playmaking — APG. High assists with low turnovers is elite. High assists with high turnovers needs context.
3. Rebounding — RPG. Especially important for bigs and wings. Guards with 5+ boards should be noted.
4. Defense — STL and BLK combined. Also consider assignment difficulty. A player tasked with guarding the best scorer on the other team may have suppressed scoring stats.
5. Turnovers — TOV/G is a negative contributor. 0 TOV/G is excellent. 3+ TOV/G is a red flag.
6. GP/Sample size — Players who played fewer games get slight regression toward mean. Don't punish missed games due to disconnects but do note it.
7. Win contribution — Players on the winning side get a small bonus. Winning is the point.

## CONTEXT RULES
- Low-scoring night ≠ bad player. A defensive assignment or role can explain it.
- Role-limited players doing their job belong in SOLID at minimum.
- One player can carry while others suffer in a blowout — read the series context.
- Sanity pass: if two adjacent players across a tier boundary are within 2 impact points, consider moving the lower player up.

## AWARDS TO NOMINATE (only nominate if genuinely warranted — don't force every award)

- MVP: Best overall player on the winning team. If series split, best overall.
- Best Shooter: Highest 3P% with sufficient attempts (3+ TPA).
- Top Playmaker: Highest APG.
- Defensive POTS: Best STL+BLK combo or clear defensive anchor.
- Iron Man: Most GP (especially if played every game).
- Zero-TO: Player with 0 TOV across the series.
- Most Efficient: Best FG% with sufficient volume (10+ FGA).
- Worst Player: Recipient of G TIER distinction.
- Best from Three: Most three-pointers made.
- Glass Cleaner: Highest RPG.
- Biggest Explosion: Best single-game high (use best_pts field).
- Glow-Up: Player who exceeded expectations given their role.
- Pretender: Player with inflated stats in a weak matchup or garbage time — use sparingly and fairly.

## OUTPUT FORMAT

Respond with STRICT JSON only. No markdown, no code fences, no explanation outside the JSON.

{
  "rankings": [
    {
      "gamertag": "string",
      "tier": "ELITE" | "STRONG" | "SOLID" | "G_TIER",
      "rank_in_tier": 1,
      "is_mvp": true | false,
      "tags": ["SWING", "GP:3"],
      "impact_note": "One sentence describing what drove their ranking."
    }
  ],
  "awards": [
    {
      "award": "MVP",
      "gamertag": "string",
      "detail": "One sentence explaining why."
    }
  ]
}`

export default async function handler(req, context) {
  // ── Method guard ────────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = _getIp(req)
  if (!_rateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests. Try again in a minute.' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } })
  }

  // ── API key ─────────────────────────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  // ── Body ────────────────────────────────────────────────────────────────────
  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const { series_id, stats, series_info } = body

  // ── Input validation ────────────────────────────────────────────────────────
  if (!stats || !Array.isArray(stats) || stats.length === 0) {
    return new Response(JSON.stringify({ error: 'stats array is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  if (stats.length > 20) {
    return new Response(JSON.stringify({ error: 'Too many players (max 20)' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  if (series_id && !UUID_RE.test(series_id)) {
    return new Response(JSON.stringify({ error: 'Invalid series_id format' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  // Build the user message with series context + stats table
  const si = series_info || {}
  const seriesContext = [
    `Series ID: ${series_id || 'unknown'}`,
    si.name ? `Series Name: ${si.name}` : null,
    si.our_team_name ? `Our Team: ${si.our_team_name}` : null,
    si.opp_team_name ? `Opponent: ${si.opp_team_name}` : null,
    (si.our_wins !== undefined && si.opp_wins !== undefined)
      ? `Result: ${si.our_wins}–${si.opp_wins} (${si.our_wins > si.opp_wins ? 'WIN' : si.our_wins < si.opp_wins ? 'LOSS' : 'TIE'})`
      : null,
  ].filter(Boolean).join('\n')

  // Sanitize + format stats for Claude
  const statsTable = sanitizeStats(stats).map(p => ({
    gamertag:      p.gamertag,
    display_name:  p.display_name,
    side:          p.primary_side,
    gp:            p.gp,
    ppg:           p.ppg,
    rpg:           p.rpg,
    apg:           p.apg,
    spg:           p.spg,
    bpg:           p.bpg,
    tov_pg:        p.tovpg,
    fg_pct:        p.fg_pct ? `${(p.fg_pct * 100).toFixed(1)}%` : 'N/A',
    three_pct:     p.three_pct ? `${(p.three_pct * 100).toFixed(1)}%` : 'N/A',
    total_tpa:     p.total_tpa,
    total_fga:     p.total_fga,
    best_pts:      p.best_pts,
    is_swing:      p.is_swing,
  }))

  const userMessage = `${seriesContext}

Player Stats:
${JSON.stringify(statsTable, null, 2)}

Rank all ${stats.length} players. Return strict JSON.`

  let aiResponse
  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const rawText = message.content[0]?.text || ''

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    aiResponse = JSON.parse(cleaned)
  } catch (err) {
    console.error('Anthropic API or parse error:', err)
    return new Response(JSON.stringify({ error: 'AI ranking failed', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(aiResponse), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
