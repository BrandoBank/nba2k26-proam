/**
 * add-game — commissioner direct entry (skips the review queue).
 * POST { series_id, game_number, our_score, opp_score, our_result, played_at,
 *        our_players, opp_players, image_hash?, force? }
 * image_hash comes from parse-screenshot so the picture is locked against re-use.
 */

import { supabaseAdmin, json, getCaller, findDuplicate, insertGame, cleanPlayers, statsFingerprint } from '../lib/shared.js'

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const caller = await getCaller(req)
  if (caller.error) return caller.error
  if (!caller.isCommissioner) return json(403, { error: 'Commissioner access required' })

  let body
  try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON' }) }

  const { series_id, game_number, our_score, opp_score, our_result } = body
  if (!series_id || !game_number || our_score == null || opp_score == null || !['W', 'L'].includes(our_result)) {
    return json(400, { error: 'Missing required fields' })
  }
  const image_hash = /^[a-f0-9]{64}$/.test(body.image_hash || '') ? body.image_hash : null
  const our_players = cleanPlayers(body.our_players)
  const opp_players = cleanPlayers(body.opp_players)

  // Hard blocks: same picture, same game number
  const hard = await findDuplicate({ series_id, game_number: Number(game_number), image_hash })
  if (hard) return json(hard.status, hard)

  // Soft blocks (commissioner can force): same stat line, or same final score
  if (!body.force) {
    const soft = await findDuplicate({ series_id, fingerprint: statsFingerprint({ our_score, opp_score, our_players, opp_players }) })
    if (soft) return json(409, { ...soft, message: `${soft.message} Submit anyway if this really is a different game.` })
    const { data: sameScore } = await supabaseAdmin.from('games').select('game_number')
      .eq('series_id', series_id).eq('our_score', Number(our_score)).eq('opp_score', Number(opp_score)).limit(1)
    if (sameScore?.length) {
      return json(409, {
        error: 'duplicate_score',
        message: `A game with score ${our_score}–${opp_score} already exists in this series (Game ${sameScore[0].game_number}). Submit anyway if this really is a different game.`,
      })
    }
  }

  try {
    const game_id = await insertGame({
      series_id, game_number, our_score, opp_score, our_result,
      played_at: body.played_at, our_players, opp_players, screenshot_hash: image_hash,
    })
    return json(200, { success: true, game_id })
  } catch (err) {
    console.error('add-game error:', err.message)
    return json(err.status || 500, { error: err.message })
  }
}
