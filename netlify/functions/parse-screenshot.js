/**
 * parse-screenshot — box score screenshot → stats, for any claimed player.
 * POST { image_base64, media_type, series_id?, parse_base64?, parse_media_type? }
 *
 *   image_base64  the original file — hashed for duplicate detection
 *   parse_base64  optional client-cropped copy (black bars trimmed) sent to the
 *                 model instead, so the stats are read at full resolution
 *
 * Returns { image_hash, ours, opp, side_reason, issues, corrections,
 *           new_players, marked_matchup, attempts }
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin, getCaller, imageHash, findDuplicate, json, snapGamertags, resolveSides } from '../lib/shared.js'
import { rateLimit, getClientIp, rateLimitResponse } from '../lib/ratelimit.js'
import { parseBoxScore, estimateCost, PARSE_MODEL } from '../lib/parse.js'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])
const MAX_B64_CHARS = 14_000_000
const B64 = /^[A-Za-z0-9+/=]+$/

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  // Any claimed player can parse (contributors); commissioner is unthrottled
  const caller = await getCaller(req)
  if (caller.error) return caller.error
  if (!caller.isCommissioner) {
    const rl = rateLimit(`parse:${caller.user.id}:${getClientIp(req.headers)}`, { windowMs: 10 * 60_000, max: 12 })
    if (!rl.allowed) return rateLimitResponse(rl.resetMs)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY not configured' })

  let body
  try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON body' }) }

  const { image_base64, media_type = 'image/jpeg', series_id } = body
  if (!image_base64 || typeof image_base64 !== 'string' || !B64.test(image_base64)) {
    return json(400, { error: 'image_base64 required' })
  }
  if (image_base64.length > MAX_B64_CHARS) return json(413, { error: 'Image too large (max ~7.5 MB)' })
  if (!ALLOWED_TYPES.has(media_type)) return json(400, { error: 'Invalid image type' })

  let parseData = image_base64, parseType = media_type
  if (body.parse_base64) {
    if (typeof body.parse_base64 !== 'string' || !B64.test(body.parse_base64) || body.parse_base64.length > MAX_B64_CHARS
      || !ALLOWED_TYPES.has(body.parse_media_type)) {
      return json(400, { error: 'Invalid cropped image' })
    }
    parseData = body.parse_base64
    parseType = body.parse_media_type
  }

  // Reject a picture that's already in the system before spending AI tokens on it
  const image_hash = imageHash(image_base64)
  const dup = await findDuplicate({ image_hash })
  if (dup) return json(dup.status, dup)

  const client = new Anthropic({ apiKey })
  let result
  try {
    result = await parseBoxScore({ client, base64: parseData, mediaType: parseType })
  } catch (err) {
    console.error('parse-screenshot error:', err.status || '', err.message)
    const auth = err.status === 401 || err.status === 403
    return json(auth ? 503 : 502, {
      error: auth ? 'Screenshot reader is misconfigured — tell the commissioner.' : 'Could not read that screenshot. Try a clearer one.',
    })
  }

  // Cost log — never block the response on it
  supabaseAdmin.from('api_usage').insert({
    function_name: 'parse-screenshot',
    tokens_input: result.usage.input_tokens,
    tokens_output: result.usage.output_tokens,
    estimated_cost_usd: Math.round(estimateCost(PARSE_MODEL, result.usage) * 100000) / 100000,
    series_id: series_id || null,
  }).then(({ error }) => { if (error) console.warn('api_usage insert failed:', error.message) })

  const { team_top: top, team_bottom: bottom } = result.parsed
  const { corrections, newPlayers } = await snapGamertags([top, bottom])
  const side = await resolveSides(series_id, top, bottom)
  const [ours, opp] = side.ours === 'top' ? [top, bottom] : [bottom, top]

  const all = [...top.players, ...bottom.players]
  const you = all.find(p => p.marker === 'you')
  const matchup = all.find(p => p.marker === 'matchup')
  const sameTeam = you && matchup && (top.players.includes(you) === top.players.includes(matchup))
  const marked_matchup = you && matchup && !sameTeam ? { defender: you.gamertag, offensive: matchup.gamertag } : null

  return json(200, {
    image_hash,
    ours,
    opp,
    side_reason: side.reason,
    issues: result.issues,
    corrections,
    new_players: newPlayers,
    marked_matchup,
    attempts: result.attempts,
  })
}
