/**
 * save-matchup — upsert a defensive matchup for a game
 * POST { game_id, defender_player_id, offensive_player_id, quarter_switches, submitted_by_gamertag }
 * Requires Authorization: Bearer <session_token>
 * Caller must own the defender player row or be a commissioner.
 */

const COMMISSIONERS = ['BrandoBank']

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({
      error: `Missing env vars: url=${!!supabaseUrl} key=${!!serviceKey}`,
    }), { status: 500 })
  }

  // Verify caller session
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })
  }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'apikey': anonKey || serviceKey,
      'Authorization': `Bearer ${token}`,
    },
  })
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401 })
  }
  const { id: userId } = await userRes.json()

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { game_id, defender_player_id, offensive_player_id, quarter_switches, submitted_by_gamertag } = body

  if (!game_id || !defender_player_id || !offensive_player_id) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
  }

  // Verify caller owns the defender row or is a commissioner
  const playerRes = await fetch(
    `${supabaseUrl}/rest/v1/players?select=gamertag&user_id=eq.${userId}`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    }
  )
  const players = await playerRes.json()
  const callerGamertag = players?.[0]?.gamertag
  const isCommissioner = callerGamertag && COMMISSIONERS.includes(callerGamertag)

  const ownerRes = await fetch(
    `${supabaseUrl}/rest/v1/players?select=id&id=eq.${defender_player_id}&user_id=eq.${userId}`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    }
  )
  const ownerRows = await ownerRes.json()
  const isOwner = ownerRows?.length > 0

  if (!isOwner && !isCommissioner) {
    return new Response(JSON.stringify({ error: 'Not authorized to submit matchup for this player' }), { status: 403 })
  }

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
