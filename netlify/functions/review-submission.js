/**
 * review-submission — commissioner review queue.
 * POST { action: 'list', series_id? }                     → pending submissions + signed image URLs
 * POST { action: 'get', id }                              → one submission + signed image URL
 * POST { action: 'approve', id, payload?, force? }        → writes the game to the live tables
 * POST { action: 'reject', id, note? }                    → marks rejected (frees the image for a corrected re-submit)
 *
 * payload lets the commissioner correct stats / game number before approving.
 */

import { supabaseAdmin, json, getCaller, findDuplicate, insertGame, cleanPlayers, statsFingerprint, SCREENSHOT_BUCKET } from '../lib/shared.js'

const SIGNED_URL_TTL = 60 * 30

async function withImageUrls(rows) {
  if (!rows.length) return rows
  const { data: signed } = await supabaseAdmin.storage.from(SCREENSHOT_BUCKET)
    .createSignedUrls(rows.map(r => r.image_path), SIGNED_URL_TTL)
  const byPath = Object.fromEntries((signed || []).map(s => [s.path, s.signedUrl]))
  return rows.map(r => ({ ...r, image_url: byPath[r.image_path] || null }))
}

const SELECT = 'id, series_id, game_number, image_path, image_hash, payload, status, review_note, created_at, submitted_by, players:submitted_by(gamertag), series:series_id(name, our_team_name, opp_team_name)'

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const caller = await getCaller(req)
  if (caller.error) return caller.error
  if (!caller.isCommissioner) return json(403, { error: 'Commissioner access required' })

  let body
  try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON' }) }

  if (body.action === 'list') {
    let q = supabaseAdmin.from('game_submissions').select(SELECT).eq('status', 'pending').order('created_at')
    if (body.series_id) q = q.eq('series_id', body.series_id)
    const { data, error } = await q
    if (error) return json(500, { error: error.message })
    return json(200, { submissions: await withImageUrls(data || []) })
  }

  if (!body.id) return json(400, { error: 'Submission id required' })
  const { data: sub } = await supabaseAdmin.from('game_submissions').select(SELECT).eq('id', body.id).maybeSingle()
  if (!sub) return json(404, { error: 'Submission not found' })

  if (body.action === 'get') {
    const [withUrl] = await withImageUrls([sub])
    return json(200, { submission: withUrl })
  }

  if (sub.status !== 'pending') return json(409, { error: `Submission already ${sub.status}` })

  if (body.action === 'reject') {
    const { error } = await supabaseAdmin.from('game_submissions').update({
      status: 'rejected',
      review_note: body.note ? String(body.note).slice(0, 500) : null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', sub.id).eq('status', 'pending')
    if (error) return json(500, { error: error.message })
    return json(200, { success: true, status: 'rejected' })
  }

  if (body.action === 'approve') {
    // Commissioner edits (if any) override what the contributor sent
    const edited = body.payload || {}
    const game_number = Number(edited.game_number ?? sub.game_number)
    const base = { ...sub.payload, ...edited }
    const game = {
      series_id: sub.series_id,
      game_number,
      our_score: Number(base.our_score),
      opp_score: Number(base.opp_score),
      our_result: base.our_result,
      played_at: base.played_at,
      our_players: cleanPlayers(base.our_players),
      opp_players: cleanPlayers(base.opp_players),
      screenshot_hash: sub.image_hash,
    }
    if (!['W', 'L'].includes(game.our_result)) return json(400, { error: 'Result must be W or L' })

    const dup = await findDuplicate({
      series_id: sub.series_id,
      game_number,
      image_hash: sub.image_hash,
      fingerprint: body.force ? null : statsFingerprint(game),
      excludeSubmissionId: sub.id,
    })
    if (dup) return json(dup.status, dup)

    try {
      const game_id = await insertGame(game)
      await supabaseAdmin.from('game_submissions').update({
        status: 'approved',
        game_number,
        payload: { ...sub.payload, ...edited, our_players: game.our_players, opp_players: game.opp_players },
        reviewed_at: new Date().toISOString(),
        approved_game_id: game_id,
      }).eq('id', sub.id)
      return json(200, { success: true, game_id })
    } catch (err) {
      console.error('review approve error:', err.message)
      return json(err.status || 500, { error: err.message })
    }
  }

  return json(400, { error: 'Unknown action' })
}
