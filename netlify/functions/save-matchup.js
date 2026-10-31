/**
 * save-matchup — upsert a defensive matchup for a game
 * POST { game_id, defender_player_id, offensive_player_id, quarter_switches, submitted_by_gamertag }
 * Uses service role key to bypass RLS/GRANT issues on the game_matchups table.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { game_id, defender_player_id, offensive_player_id, quarter_switches, submitted_by_gamertag } = body

  if (!game_id || !defender_player_id || !offensive_player_id) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('game_matchups')
    .upsert({
      game_id,
      defender_player_id,
      offensive_player_id,
      quarter_switches: quarter_switches || [],
      submitted_by_gamertag: submitted_by_gamertag || null,
    }, { onConflict: 'game_id,defender_player_id' })
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ data }), { status: 200 })
}
