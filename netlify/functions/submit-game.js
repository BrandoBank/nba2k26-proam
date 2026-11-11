/**
 * submit-game — any claimed player submits a game for commissioner review.
 * POST { series_id, game_number, image_base64, media_type, our_score, opp_score,
 *        our_result, played_at, our_players, opp_players }
 *
 * The screenshot is required: its SHA-256 is the duplicate key, and the
 * commissioner reviews the parsed stats against the original image.
 * Nothing is written to games/game_stats here — only to game_submissions.
 */

import { supabaseAdmin, json, getCaller, imageHash, findDuplicate, cleanPlayers, cleanMatchup, statsFingerprint, SCREENSHOT_BUCKET } from '../lib/shared.js'
import { rateLimit, getClientIp, rateLimitResponse } from '../lib/ratelimit.js'

const ALLOWED_TYPES = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
const MAX_B64_CHARS = 14_000_000

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const rl = rateLimit(`submit:${getClientIp(req.headers)}`, { windowMs: 10 * 60_000, max: 15 })
  if (!rl.allowed) return rateLimitResponse(rl.resetMs)

  const caller = await getCaller(req)
  if (caller.error) return caller.error

  let body
  try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON' }) }

  const { series_id, image_base64, media_type, our_score, opp_score, our_result } = body
  const game_number = Number(body.game_number)
  if (!series_id || !Number.isInteger(game_number) || game_number < 1 || game_number > 7) {
    return json(400, { error: 'Series and a game number (1–7) are required' })
  }
  if (our_score == null || opp_score == null || !['W', 'L'].includes(our_result)) {
    return json(400, { error: 'Final score and result are required' })
  }
  if (!image_base64 || typeof image_base64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(image_base64)) {
    return json(400, { error: 'A box score screenshot is required' })
  }
  if (image_base64.length > MAX_B64_CHARS) return json(413, { error: 'Image too large (max ~7.5 MB)' })
  const ext = ALLOWED_TYPES[media_type]
  if (!ext) return json(400, { error: 'Invalid image type' })

  const { data: series } = await supabaseAdmin.from('series').select('id, status').eq('id', series_id).maybeSingle()
  if (!series) return json(404, { error: 'Series not found' })
  if (series.status === 'complete') return json(409, { error: 'This series is already complete' })

  const our_players = cleanPlayers(body.our_players)
  const opp_players = cleanPlayers(body.opp_players)
  if (!our_players.some(p => p.gamertag) || !opp_players.some(p => p.gamertag)) {
    return json(400, { error: 'Both teams need at least one player' })
  }

  const image_hash = imageHash(image_base64)
  const fingerprint = statsFingerprint({ our_score, opp_score, our_players, opp_players })
  const dup = await findDuplicate({ series_id, game_number, image_hash, fingerprint })
  if (dup) return json(dup.status, dup)

  // Store the original screenshot for review
  const image_path = `${series_id}/${image_hash}.${ext}`
  const { error: upErr } = await supabaseAdmin.storage.from(SCREENSHOT_BUCKET)
    .upload(image_path, Buffer.from(image_base64, 'base64'), { contentType: media_type, upsert: true })
  if (upErr) {
    console.error('submit-game upload error:', upErr.message)
    return json(500, { error: 'Could not store screenshot — try again' })
  }

  const { data: row, error: insErr } = await supabaseAdmin.from('game_submissions').insert({
    series_id,
    game_number,
    submitted_by: caller.player.id,
    submitted_by_user: caller.user.id,
    image_hash,
    image_path,
    stats_fingerprint: fingerprint,
    payload: {
      our_score: Number(our_score),
      opp_score: Number(opp_score),
      our_result,
      played_at: body.played_at || null,
      our_players,
      opp_players,
      marked_matchup: cleanMatchup(body.marked_matchup),
    },
  }).select('id').single()

  if (insErr) {
    // Unique index race: two people submitting the same picture at once
    if (insErr.code === '23505') return json(409, { error: 'duplicate_image', message: 'This screenshot was already submitted.' })
    console.error('submit-game insert error:', insErr.message)
    return json(500, { error: 'Could not save submission' })
  }

  return json(200, { success: true, submission_id: row.id, status: 'pending' })
}
