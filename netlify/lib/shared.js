/**
 * Shared helpers for the game upload pipeline:
 *   parse-screenshot → submit-game → review-submission (approve) → live tables
 *   parse-screenshot → add-game (commissioner direct entry)
 */

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const COMMISSIONERS = ['BrandoBank']
export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']
export const SCREENSHOT_BUCKET = 'box-scores'
const STAT_FIELDS = ['pts', 'reb', 'ast', 'stl', 'blk', 'fouls', 'tov', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta']

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

/**
 * Resolve the caller from the Bearer token.
 * Returns { user, player, isCommissioner } or { error: Response }.
 * A claimed player profile is required — anonymous accounts can't contribute.
 */
export async function getCaller(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: json(401, { error: 'Authentication required' }) }
  const { data: { user } = {}, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { error: json(401, { error: 'Invalid or expired session' }) }
  const { data: player } = await supabaseAdmin
    .from('players').select('id, gamertag').eq('user_id', user.id).maybeSingle()
  if (!player) return { error: json(403, { error: 'Claim your player profile before contributing' }) }
  return { user, player, isCommissioner: COMMISSIONERS.includes(player.gamertag) }
}

/** SHA-256 of the decoded image bytes — identical files always collide. */
export function imageHash(base64) {
  return createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex')
}

/**
 * Stat fingerprint for a single game. Catches the same box score uploaded as
 * a different file (re-screenshot, crop, recompression) — the bytes differ but
 * the numbers don't.
 */
export function statsFingerprint({ our_score, opp_score, our_players = [], opp_players = [] }) {
  const rows = [...our_players, ...opp_players]
    .filter(p => p?.gamertag?.trim())
    .map(p => [p.gamertag.trim().toLowerCase(), +p.pts || 0, +p.reb || 0, +p.ast || 0, +p.fgm || 0, +p.fga || 0].join(':'))
    .sort()
  return `${+our_score || 0}-${+opp_score || 0}|${rows.join(',')}`
}

/** Normalise player rows from the client — numbers only, trimmed tags, max 5 per side. */
export function cleanPlayers(players) {
  if (!Array.isArray(players)) return []
  return players.slice(0, 5).map((p, i) => {
    const row = {
      slot: i + 1,
      gamertag: String(p?.gamertag || '').trim().slice(0, 40),
      grade: p?.grade ? String(p.grade).trim().slice(0, 3) : null,
      matchup_gamertag: p?.matchup_gamertag ? String(p.matchup_gamertag).trim().slice(0, 40) : '',
    }
    for (const f of STAT_FIELDS) row[f] = Math.max(0, Math.min(999, Math.trunc(+p?.[f] || 0)))
    return row
  })
}

/**
 * Check every duplicate rule. Returns { status, error, message } or null.
 *   - image already used by a live game or an open/approved submission
 *   - game number already live, or already waiting in the queue
 *   - identical stat line already live or queued in this series
 */
export async function findDuplicate({ series_id, game_number, image_hash, fingerprint, excludeSubmissionId }) {
  if (image_hash) {
    const [{ data: liveImg }, { data: queuedImg }] = await Promise.all([
      supabaseAdmin.from('games').select('id, game_number, series_id').eq('screenshot_hash', image_hash).limit(1),
      supabaseAdmin.from('game_submissions').select('id, game_number, status')
        .eq('image_hash', image_hash).neq('status', 'rejected').limit(1),
    ])
    const q = (queuedImg || []).filter(r => r.id !== excludeSubmissionId)
    if (liveImg?.length) {
      return { status: 409, error: 'duplicate_image', message: `This screenshot was already uploaded (Game ${liveImg[0].game_number}).` }
    }
    if (q.length) {
      return { status: 409, error: 'duplicate_image', message: `This screenshot was already submitted for Game ${q[0].game_number} and is ${q[0].status === 'pending' ? 'waiting for review' : 'already approved'}.` }
    }
  }

  if (!series_id) return null

  if (game_number) {
    const [{ data: liveGame }, { data: queuedGame }] = await Promise.all([
      supabaseAdmin.from('games').select('id').eq('series_id', series_id).eq('game_number', game_number).limit(1),
      supabaseAdmin.from('game_submissions').select('id').eq('series_id', series_id)
        .eq('game_number', game_number).eq('status', 'pending').limit(2),
    ])
    if (liveGame?.length) {
      return { status: 409, error: 'duplicate_game_number', message: `Game ${game_number} is already in this series.` }
    }
    if ((queuedGame || []).some(r => r.id !== excludeSubmissionId)) {
      return { status: 409, error: 'duplicate_game_number', message: `Someone already submitted Game ${game_number} — it's waiting for commissioner review.` }
    }
  }

  if (fingerprint) {
    const { data: queued } = await supabaseAdmin.from('game_submissions').select('id, game_number')
      .eq('series_id', series_id).eq('stats_fingerprint', fingerprint).neq('status', 'rejected')
    const q = (queued || []).filter(r => r.id !== excludeSubmissionId)
    if (q.length) {
      return { status: 409, error: 'duplicate_stats', message: `This box score matches Game ${q[0].game_number}, which was already submitted.` }
    }
    const liveFps = await liveFingerprints(series_id)
    const hit = liveFps.find(g => g.fingerprint === fingerprint)
    if (hit) {
      return { status: 409, error: 'duplicate_stats', message: `This box score matches Game ${hit.game_number}, which is already in this series.` }
    }
  }
  return null
}

async function liveFingerprints(series_id) {
  const [{ data: games }, { data: stats }] = await Promise.all([
    supabaseAdmin.from('games').select('id, game_number, our_score, opp_score').eq('series_id', series_id),
    supabaseAdmin.from('game_stats').select('game_id, side, pts, reb, ast, fgm, fga, players(gamertag)').eq('series_id', series_id),
  ])
  return (games || []).map(g => {
    const rows = (stats || []).filter(s => s.game_id === g.id).map(s => ({ ...s, gamertag: s.players?.gamertag }))
    return {
      game_number: g.game_number,
      fingerprint: statsFingerprint({
        our_score: g.our_score, opp_score: g.opp_score,
        our_players: rows.filter(r => r.side === 'our'),
        opp_players: rows.filter(r => r.side === 'opp'),
      }),
    }
  })
}

// Characters the model (and humans) confuse in 2K's font
const confusable = s => s.toLowerCase()
  .replace(/0/g, 'o').replace(/[1il|]/g, 'l').replace(/5/g, 's').replace(/2/g, 'z').replace(/8/g, 'b')

/**
 * Snap parsed gamertags onto existing players. Exact (case-insensitive) match
 * wins; otherwise a unique confusable-character match is corrected. Anything
 * else is flagged as a new player so the reviewer double-checks the spelling.
 */
export async function snapGamertags(teams) {
  const { data: players } = await supabaseAdmin.from('players').select('gamertag')
  const known = (players || []).map(p => p.gamertag)
  const byLower = new Map(known.map(t => [t.toLowerCase(), t]))
  const byConf = new Map()
  for (const t of known) byConf.set(confusable(t), [...(byConf.get(confusable(t)) || []), t])

  const corrections = [], newPlayers = []
  const snap = raw => {
    const tag = String(raw || '').trim()
    if (!tag) return tag
    if (byLower.has(tag.toLowerCase())) return byLower.get(tag.toLowerCase())
    const hits = byConf.get(confusable(tag)) || []
    if (hits.length === 1) { corrections.push({ from: tag, to: hits[0] }); return hits[0] }
    newPlayers.push(tag)
    return tag
  }
  for (const team of teams) for (const p of team.players || []) p.gamertag = snap(p.gamertag)
  return { corrections, newPlayers }
}

/**
 * Decide which parsed team is "our" side. Team names on the 2K screen are
 * unreliable (both sections can carry the same name), so use rosters:
 *   1. players already recorded in this series, by side
 *   2. the team a commissioner is on (BrandoBank has always been "our")
 *   3. fall back to the bottom section
 */
export async function resolveSides(series_id, top, bottom) {
  const tags = t => new Set((t.players || []).map(p => p.gamertag.toLowerCase()))
  const topTags = tags(top), bottomTags = tags(bottom)

  if (series_id) {
    const { data: rows } = await supabaseAdmin.from('game_stats')
      .select('side, players(gamertag)').eq('series_id', series_id)
    let topScore = 0
    for (const r of rows || []) {
      const t = r.players?.gamertag?.toLowerCase()
      const sign = r.side === 'our' ? 1 : -1
      if (topTags.has(t)) topScore += sign
      if (bottomTags.has(t)) topScore -= sign
    }
    if (topScore !== 0) return { ours: topScore > 0 ? 'top' : 'bottom', reason: 'series roster' }
  }
  const comm = COMMISSIONERS.map(c => c.toLowerCase())
  if (comm.some(c => topTags.has(c))) return { ours: 'top', reason: 'commissioner on team' }
  if (comm.some(c => bottomTags.has(c))) return { ours: 'bottom', reason: 'commissioner on team' }
  return { ours: 'bottom', reason: 'guess' }
}

export function cleanMatchup(m) {
  if (!m?.defender || !m?.offensive) return null
  return { defender: String(m.defender).trim().slice(0, 40), offensive: String(m.offensive).trim().slice(0, 40) }
}

/**
 * Write a game to the live tables: players (created if new), games, game_stats,
 * game_matchups, then recompute the series record. Rolls back the game row if
 * stats fail. Returns the new game id.
 */
export async function insertGame({ series_id, game_number, our_score, opp_score, our_result, played_at, our_players, opp_players, screenshot_hash, marked_matchup, submitted_by_gamertag }) {
  const { data: series, error: seriesErr } = await supabaseAdmin
    .from('series').select('id, format').eq('id', series_id).single()
  if (seriesErr || !series) throw Object.assign(new Error('Series not found'), { status: 404 })

  const ours = (our_players || []).filter(p => p.gamertag?.trim())
  const opps = (opp_players || []).filter(p => p.gamertag?.trim())

  // 1. Resolve or create players
  const playerMap = {}
  for (const p of [...ours, ...opps]) {
    const tag = p.gamertag.trim()
    if (playerMap[tag]) continue
    const { data: found } = await supabaseAdmin.from('players').select('id').ilike('gamertag', tag).maybeSingle()
    if (found) { playerMap[tag] = found.id; continue }
    const { data: created, error: newErr } = await supabaseAdmin
      .from('players')
      .insert({ gamertag: tag, default_position: POSITIONS[(p.slot || 1) - 1] || 'PG' })
      .select('id').single()
    if (newErr) throw new Error(`Failed to create player ${tag}: ${newErr.message}`)
    playerMap[tag] = created.id
  }

  // 2. Game row
  const { data: gameRow, error: gameErr } = await supabaseAdmin
    .from('games')
    .insert({
      series_id,
      game_number: Number(game_number),
      our_score: Number(our_score),
      opp_score: Number(opp_score),
      our_result,
      played_at: played_at || new Date().toISOString(),
      screenshot_hash: screenshot_hash || null,
    })
    .select('id').single()
  if (gameErr) {
    const dup = gameErr.code === '23505'
    throw Object.assign(new Error(dup ? 'This game or screenshot is already in the system' : gameErr.message), { status: dup ? 409 : 500 })
  }

  // 3. Stats
  const toRow = side => p => ({
    game_id: gameRow.id, series_id, side,
    player_id: playerMap[p.gamertag.trim()],
    grade: p.grade || null,
    ...Object.fromEntries(STAT_FIELDS.map(f => [f, +p[f] || 0])),
  })
  const statsRows = [...ours.map(toRow('our')), ...opps.map(toRow('opp'))]
  if (statsRows.length) {
    const { error: statsErr } = await supabaseAdmin.from('game_stats').insert(statsRows)
    if (statsErr) {
      await supabaseAdmin.from('games').delete().eq('id', gameRow.id)
      throw new Error(statsErr.message)
    }
  }

  // 4. Matchups from the opponent "YOUR MATCHUP" column
  const matchupRows = opps
    .filter(p => p.matchup_gamertag?.trim())
    .map(p => ({ game_id: gameRow.id, series_id, defender_player_id: playerMap[p.gamertag.trim()], offensive_player_id: playerMap[p.matchup_gamertag.trim()] }))
    .filter(r => r.defender_player_id && r.offensive_player_id)
  // Green "YOU" arrow + red "YOUR MATCHUP" arrow on the screenshot
  const mm = cleanMatchup(marked_matchup)
  if (mm) {
    const d = playerMap[mm.defender], o = playerMap[mm.offensive]
    if (d && o && d !== o && !matchupRows.some(r => r.defender_player_id === d)) {
      matchupRows.push({ game_id: gameRow.id, series_id, defender_player_id: d, offensive_player_id: o, submitted_by_gamertag: submitted_by_gamertag || null })
    }
  }
  if (matchupRows.length) {
    const { error: mErr } = await supabaseAdmin.from('game_matchups').insert(matchupRows)
    if (mErr) console.warn('insertGame: matchups not saved:', mErr.message)
  }

  // 5. Series record
  const { data: allGames } = await supabaseAdmin.from('games').select('our_result').eq('series_id', series_id)
  const wins = (allGames || []).filter(g => g.our_result === 'W').length
  const losses = (allGames || []).filter(g => g.our_result === 'L').length
  const clinch = Math.ceil(series.format / 2)
  const isComplete = wins >= clinch || losses >= clinch
  await supabaseAdmin.from('series').update({
    our_wins: wins,
    opp_wins: losses,
    ...(isComplete ? { status: 'complete', ended_at: new Date().toISOString() } : {}),
  }).eq('id', series_id)

  return gameRow.id
}
