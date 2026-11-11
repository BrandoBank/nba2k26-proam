/**
 * series-admin — commissioner series actions that used to be direct client
 * writes (which failed silently when RLS/grants rejected them).
 * POST { action: 'publish', series_id, published: boolean }
 * POST { action: 'complete', series_id }
 * Returns the updated series row so the UI reflects what was actually saved.
 */

import { supabaseAdmin, json, getCaller } from '../lib/shared.js'

const FIELDS = 'id, published, status, our_wins, opp_wins, result_label, ended_at'

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const caller = await getCaller(req)
  if (caller.error) return caller.error
  if (!caller.isCommissioner) return json(403, { error: 'Commissioner access required' })

  let body
  try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON' }) }
  const { action, series_id } = body
  if (!series_id) return json(400, { error: 'series_id required' })

  let update
  if (action === 'publish') {
    if (typeof body.published !== 'boolean') return json(400, { error: 'published must be true or false' })
    update = { published: body.published }
  } else if (action === 'complete') {
    const { data: games } = await supabaseAdmin.from('games').select('our_result').eq('series_id', series_id)
    const wins = (games || []).filter(g => g.our_result === 'W').length
    const losses = (games || []).filter(g => g.our_result === 'L').length
    update = {
      status: 'complete',
      our_wins: wins,
      opp_wins: losses,
      result_label: `${wins}–${losses} ${wins > losses ? 'W' : 'L'}`,
      ended_at: new Date().toISOString(),
      published: true,
    }
  } else {
    return json(400, { error: 'Unknown action' })
  }

  const { data, error } = await supabaseAdmin.from('series').update(update).eq('id', series_id).select(FIELDS).maybeSingle()
  if (error) return json(500, { error: error.message })
  if (!data) return json(404, { error: 'Series not found' })
  return json(200, { series: data })
}
