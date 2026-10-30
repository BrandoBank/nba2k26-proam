/**
 * add-game — public endpoint for submitting a box score game
 * POST { series_id, game_number, our_score, opp_score, our_result, our_players, opp_players }
 * Uses service role key — no auth required, open to any user with a series link
 */

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { series_id, game_number, our_score, opp_score, our_result, our_players, opp_players } = body

  if (!series_id || !game_number || our_score == null || opp_score == null || !our_result) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
  }

  // Verify series exists
  const { data: series, error: seriesErr } = await supabaseAdmin
    .from('series').select('id, our_wins, opp_wins').eq('id', series_id).single()
  if (seriesErr || !series) {
    return new Response(JSON.stringify({ error: 'Series not found' }), { status: 404 })
  }

  // Check for duplicate game number
  const { data: existing } = await supabaseAdmin
    .from('games').select('id').eq('series_id', series_id).eq('game_number', game_number)
  if (existing?.length > 0) {
    return new Response(JSON.stringify({ error: `Game ${game_number} already exists in this series` }), { status: 409 })
  }

  try {
    // 1. Upsert all players (create if gamertag not found)
    const allPlayerRows = [...(our_players || []), ...(opp_players || [])]
      .filter(p => p.gamertag?.trim())

    const playerMap = {}
    for (const p of allPlayerRows) {
      const tag = p.gamertag.trim()
      if (playerMap[tag]) continue
      const { data: found } = await supabaseAdmin
        .from('players').select('id').ilike('gamertag', tag).single()
      if (found) {
        playerMap[tag] = found.id
      } else {
        const slot = p.slot || 1
        const { data: newP, error: newErr } = await supabaseAdmin
          .from('players')
          .insert({ gamertag: tag, default_position: POSITIONS[slot - 1] || 'PG' })
          .select().single()
        if (newErr) throw new Error(`Failed to create player ${tag}: ${newErr.message}`)
        playerMap[tag] = newP.id
      }
    }

    // 2. Insert game row
    const { data: gameRow, error: gameErr } = await supabaseAdmin
      .from('games')
      .insert({
        series_id,
        game_number: Number(game_number),
        our_score: Number(our_score),
        opp_score: Number(opp_score),
        our_result,
        played_at: body.played_at || new Date().toISOString(),
      })
      .select().single()
    if (gameErr) throw new Error(gameErr.message)

    // 3. Insert game_stats
    const statsRows = [
      ...(our_players || []).filter(p => p.gamertag?.trim()).map(p => ({
        game_id: gameRow.id,
        player_id: playerMap[p.gamertag.trim()],
        side: 'our',
        grade: p.grade || null,
        pts: +p.pts || 0, reb: +p.reb || 0, ast: +p.ast || 0,
        stl: +p.stl || 0, blk: +p.blk || 0, fouls: +p.fouls || 0, tov: +p.tov || 0,
        fgm: +p.fgm || 0, fga: +p.fga || 0,
        tpm: +p.tpm || 0, tpa: +p.tpa || 0,
        ftm: +p.ftm || 0, fta: +p.fta || 0,
      })),
      ...(opp_players || []).filter(p => p.gamertag?.trim()).map(p => ({
        game_id: gameRow.id,
        player_id: playerMap[p.gamertag.trim()],
        side: 'opp',
        grade: p.grade || null,
        pts: +p.pts || 0, reb: +p.reb || 0, ast: +p.ast || 0,
        stl: +p.stl || 0, blk: +p.blk || 0, fouls: +p.fouls || 0, tov: +p.tov || 0,
        fgm: +p.fgm || 0, fga: +p.fga || 0,
        tpm: +p.tpm || 0, tpa: +p.tpa || 0,
        ftm: +p.ftm || 0, fta: +p.fta || 0,
      })),
    ]
    if (statsRows.length > 0) {
      const { error: statsErr } = await supabaseAdmin.from('game_stats').insert(statsRows)
      if (statsErr) throw new Error(statsErr.message)
    }

    // 4. Insert matchups from opp players' matchup_gamertag field
    const matchupRows = []
    for (const p of (opp_players || [])) {
      if (!p.gamertag?.trim() || !p.matchup_gamertag?.trim()) continue
      const defId = playerMap[p.gamertag.trim()]
      const offId = playerMap[p.matchup_gamertag.trim()]
      if (defId && offId) {
        matchupRows.push({ game_id: gameRow.id, defender_player_id: defId, offensive_player_id: offId })
      }
    }
    if (matchupRows.length > 0) {
      await supabaseAdmin.from('game_matchups').insert(matchupRows)
    }

    // 5. Update series win/loss counts
    const { data: allGames } = await supabaseAdmin
      .from('games').select('our_result').eq('series_id', series_id)
    const wins = (allGames || []).filter(g => g.our_result === 'W').length
    const losses = (allGames || []).filter(g => g.our_result === 'L').length
    await supabaseAdmin.from('series').update({ our_wins: wins, opp_wins: losses }).eq('id', series_id)

    return new Response(JSON.stringify({ success: true, game_id: gameRow.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('add-game error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
