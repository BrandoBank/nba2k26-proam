/**
 * save-matchup — upsert a defensive matchup for a game
 * POST { game_id, defender_player_id, offensive_player_id, quarter_switches, submitted_by_gamertag }
 * Uses Supabase REST API directly with service role key to bypass RLS/GRANT.
 */

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({
      error: `Missing env vars: url=${!!supabaseUrl} key=${!!serviceKey}`,
    }), { status: 500 })
  }

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { game_id, defender_player_id, offensive_player_id, quarter_switches, submitted_by_gamertag } = body

  if (!game_id || !defender_player_id || !offensive_player_id) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
  }

  // Use raw REST API to guarantee service role is applied
  const payload = {
    game_id,
    defender_player_id,
    offensive_player_id,
    quarter_switches: quarter_switches || [],
    submitted_by_gamertag: submitted_by_gamertag || null,
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/game_matchups?on_conflict=game_id%2Cdefender_player_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    let msg
    try { msg = JSON.parse(text).message || text } catch { msg = text }
    return new Response(JSON.stringify({ error: msg }), { status: res.status })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
