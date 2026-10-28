/**
 * import-history — Netlify serverless function
 * POST { series: [...] }
 * Bulk-inserts series history using service role key (bypasses RLS)
 * Protected: requires valid Supabase session token in Authorization header
 */

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export default async function handler(req, context) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  // Verify the caller is an authenticated editor
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 })
  }

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { series: seriesList } = body
  if (!Array.isArray(seriesList) || seriesList.length === 0) {
    return new Response(JSON.stringify({ error: 'series array required' }), { status: 400 })
  }
  if (seriesList.length > 50) {
    return new Response(JSON.stringify({ error: 'Max 50 series per import' }), { status: 400 })
  }

  // Use the user's own token for inserts (RLS allows authenticated users)
  const supabaseUser = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } }
  )

  const logs = []
  const errors = []
  let seriesCreated = 0, gamesCreated = 0, statsCreated = 0

  for (const serData of seriesList) {
    logs.push(`→ ${serData.name}`)

    // Collect all gamertags
    const allGamertags = new Set()
    for (const game of (serData.games || [])) {
      for (const stat of (game.stats || [])) {
        if (stat.gamertag) allGamertags.add(stat.gamertag)
      }
    }

    // Upsert players
    const playerMap = {}
    for (const gtag of allGamertags) {
      const { data: existing } = await supabaseUser
        .from('players').select('id').eq('gamertag', gtag).maybeSingle()
      if (existing) {
        playerMap[gtag] = existing.id
      } else {
        const { data: created, error } = await supabaseUser
          .from('players').insert({ gamertag: gtag, display_name: gtag }).select('id').single()
        if (error) { logs.push(`  ⚠ Player ${gtag}: ${error.message}`); continue }
        playerMap[gtag] = created.id
        logs.push(`  + Player: ${gtag}`)
      }
    }

    // Insert series
    const { data: series, error: serErr } = await supabaseAdmin.from('series').insert({
      name: serData.name,
      our_team_name: serData.our_team_name || 'Team 1',
      opp_team_name: serData.opp_team_name || 'Team 2',
      format: serData.format || 7,
      our_wins: serData.our_wins || 0,
      opp_wins: serData.opp_wins || 0,
      result_label: serData.result_label || null,
      storyline: serData.storyline || null,
      drafted_by: serData.drafted_by || null,
      status: serData.status || 'complete',
      published: serData.status === 'complete',
      started_at: serData.started_at || null,
      ended_at: serData.ended_at || null,
    }).select('id').single()

    if (serErr) {
      logs.push(`  ✗ Series failed: ${serErr.message}`)
      errors.push(serErr.message)
      continue
    }
    seriesCreated++
    logs.push(`  ✓ Series created`)

    // Insert games + stats
    for (const gameData of (serData.games || [])) {
      const { data: game, error: gameErr } = await supabaseAdmin.from('games').insert({
        series_id: series.id,
        game_number: gameData.game_number,
        our_score: gameData.our_score,
        opp_score: gameData.opp_score,
        our_result: gameData.our_result,
      }).select('id').single()

      if (gameErr) { logs.push(`  ✗ Game ${gameData.game_number}: ${gameErr.message}`); continue }
      gamesCreated++

      const statRows = []
      for (const stat of (gameData.stats || [])) {
        const pid = playerMap[stat.gamertag]
        if (!pid) { logs.push(`  ⚠ Unknown: ${stat.gamertag}`); continue }
        statRows.push({
          game_id: game.id,
          player_id: pid,
          side: stat.side,
          pts: stat.pts ?? 0, reb: stat.reb ?? 0, ast: stat.ast ?? 0,
          stl: stat.stl ?? 0, blk: stat.blk ?? 0, tov: stat.tov ?? 0,
          fgm: stat.fgm ?? 0, fga: stat.fga ?? 0,
          tpm: stat.tpm ?? 0, tpa: stat.tpa ?? 0,
          ftm: stat.ftm ?? 0, fta: stat.fta ?? 0,
          grade: stat.grade ?? null,
        })
      }

      if (statRows.length > 0) {
        const { error: statErr } = await supabaseAdmin.from('game_stats').insert(statRows)
        if (statErr) logs.push(`  ✗ Stats G${gameData.game_number}: ${statErr.message}`)
        else statsCreated += statRows.length
      }
    }

    // MVP ranking stub
    if (serData.mvp_gamertag && playerMap[serData.mvp_gamertag]) {
      await supabaseAdmin.from('series_rankings').upsert({
        series_id: series.id,
        player_id: playerMap[serData.mvp_gamertag],
        gamertag: serData.mvp_gamertag,
        tier: 'ELITE',
        is_mvp: true,
        finalized: false,
      }, { onConflict: 'series_id,player_id' })
    }
  }

  logs.push(`\n✅ ${seriesCreated} series · ${gamesCreated} games · ${statsCreated} stat rows`)

  return new Response(JSON.stringify({ logs, seriesCreated, gamesCreated, statsCreated, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
