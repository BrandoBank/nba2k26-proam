/**
 * series-admin — commissioner series actions that used to be direct client
 * writes (which failed silently when RLS/grants rejected them).
 * POST { action: 'publish', series_id, published: boolean }
 * POST { action: 'complete', series_id }
 * POST { action: 'end', series_id }      → complete if someone clinched, else unfinished
 * POST { action: 'create', series: {...} } → closes any live series, then creates
 *   (only one series can be live — also enforced by a unique index)
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

  if (action === 'create') {
    const f = body.series || {}
    const name = String(f.name || '').trim().slice(0, 120)
    const format = [1, 3, 5, 7].includes(Number(f.format)) ? Number(f.format) : 7
    if (!name || !String(f.our_team_name || '').trim() || !String(f.opp_team_name || '').trim()) {
      return json(400, { error: 'Name and both team names are required' })
    }
    // Close whatever is live first — it keeps its games and rankings
    const { data: closed, error: closeErr } = await supabaseAdmin.from('series')
      .update({ status: 'unfinished', ended_at: new Date().toISOString() })
      .eq('status', 'in_progress').select('id, name')
    if (closeErr) return json(500, { error: `Could not close the live series: ${closeErr.message}` })
    const { data, error } = await supabaseAdmin.from('series').insert({
      name,
      our_team_name: String(f.our_team_name).trim().slice(0, 60),
      opp_team_name: String(f.opp_team_name).trim().slice(0, 60),
      format,
      storyline: f.storyline ? String(f.storyline).trim().slice(0, 500) : null,
      drafted_by: f.drafted_by ? String(f.drafted_by).trim().slice(0, 120) : null,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    }).select('id, name').single()
    if (error) return json(500, { error: error.message })
    return json(200, { series: data, closed: closed || [] })
  }

  if (!series_id) return json(400, { error: 'series_id required' })

  let update
  if (action === 'publish') {
    if (typeof body.published !== 'boolean') return json(400, { error: 'published must be true or false' })
    update = { published: body.published }
  } else if (action === 'complete' || action === 'end') {
    const { data: games } = await supabaseAdmin.from('games').select('our_result').eq('series_id', series_id)
    const wins = (games || []).filter(g => g.our_result === 'W').length
    const losses = (games || []).filter(g => g.our_result === 'L').length
    const { data: ser } = await supabaseAdmin.from('series').select('format').eq('id', series_id).maybeSingle()
    const clinch = Math.ceil((ser?.format || 7) / 2)
    const finished = action === 'complete' || wins >= clinch || losses >= clinch
    update = {
      status: finished ? 'complete' : 'unfinished',
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
