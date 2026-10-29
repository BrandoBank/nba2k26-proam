import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// claude-sonnet-5 pricing per million tokens
const INPUT_COST_PER_M = 3.0
const OUTPUT_COST_PER_M = 15.0

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])
const MAX_B64_CHARS = 14_000_000

const SYSTEM_PROMPT = `You are a stat transcription robot for NBA 2K box score screenshots. Your only job is to copy numbers and text exactly as shown — no inference, no estimation.

## LAYOUT
Two teams are shown. Each team lists players top-to-bottom in position order (PG, SG, SF, PF, C). There may be 3, 4, or 5 players per team depending on the game mode.

Stat columns left-to-right: GRADE | PTS | REB | AST | STL | BLK | PF | TO | FGM-FGA | 3PM-3PA | FTM-FTA

The bottom team may have a "YOUR MATCHUP" column at the far right showing the opponent gamertag they were assigned to guard.

## CRITICAL — GAMERTAG TRANSCRIPTION
Gamertags are case-sensitive and use mixed alphanumerics. YOU MUST:
1. Read each character individually — do not guess or auto-correct spelling
2. Distinguish: digit 0 (zero) vs letter O (oh), digit 1 (one) vs letter l (lowercase L) vs letter I (capital i), digit 5 vs letter S
3. Preserve ALL underscores, numbers, capitals exactly as shown
4. Do NOT add or remove any characters
5. If a character is genuinely ambiguous due to font rendering, pick the most visually accurate one

## CRITICAL — STAT ACCURACY
- FGM-FGA, 3PM-3PA, FTM-FTA columns show "X/Y" — X is made, Y is attempted. Never swap them.
- fgm MUST always be ≤ fga. If your read would violate this, re-examine the cell.
- tpm MUST always be ≤ tpa. Same rule.
- pts MUST equal (fgm - tpm) * 2 + tpm * 3 + ftm, approximately. If it's wildly off, re-read the FG row.
- Blank or "--" cells = 0, not null
- Grade: A+, A, A-, B+, B, B-, C+, C, C-, D, F — copy exactly, or null if the column is absent

## OUTPUT
Return ONLY valid JSON with no markdown fences, no explanation, no trailing text.

{
  "team_top": {
    "name": "<team name exactly as shown>",
    "score": <integer>,
    "players": [
      {
        "position_slot": 1,
        "gamertag": "<exact gamertag — transcribed character by character>",
        "grade": "<grade or null>",
        "pts": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0, "fouls": 0, "tov": 0,
        "fgm": 0, "fga": 0, "tpm": 0, "tpa": 0, "ftm": 0, "fta": 0
      }
    ]
  },
  "team_bottom": {
    "name": "<team name exactly as shown>",
    "score": <integer>,
    "players": [
      {
        "position_slot": 1,
        "gamertag": "<exact gamertag — transcribed character by character>",
        "grade": "<grade or null>",
        "pts": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0, "fouls": 0, "tov": 0,
        "fgm": 0, "fga": 0, "tpm": 0, "tpa": 0, "ftm": 0, "fta": 0,
        "matchup_gamertag": "<gamertag from YOUR MATCHUP column, or null>"
      }
    ]
  }
}`

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { image_base64, media_type = 'image/jpeg' } = body

  if (!image_base64 || typeof image_base64 !== 'string') {
    return new Response(JSON.stringify({ error: 'image_base64 required' }), { status: 400 })
  }
  if (image_base64.length > MAX_B64_CHARS) {
    return new Response(JSON.stringify({ error: 'Image too large (max ~7.5 MB)' }), { status: 413 })
  }
  if (!ALLOWED_TYPES.has(media_type)) {
    return new Response(JSON.stringify({ error: 'Invalid image type' }), { status: 400 })
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(image_base64)) {
    return new Response(JSON.stringify({ error: 'Invalid base64 data' }), { status: 400 })
  }

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: 'Parse every stat from this box score screenshot. Before returning, verify: (1) every gamertag was copied character-by-character, (2) fgm ≤ fga and tpm ≤ tpa for every player, (3) no player row was skipped. Then return the JSON.' },
          ],
        },
      ],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    if (!textBlock) throw new Error('No text output from model')

    let raw = textBlock.text.trim()
    // Strip any accidental markdown fences
    raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    const parsed = JSON.parse(raw)

    // Log usage — fire and forget, never block the response
    const inputTokens = message.usage?.input_tokens || 0
    const outputTokens = message.usage?.output_tokens || 0
    const costUsd = (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M
    supabaseAdmin.from('api_usage').insert({
      function_name: 'parse-screenshot',
      tokens_input: inputTokens,
      tokens_output: outputTokens,
      estimated_cost_usd: Math.round(costUsd * 100000) / 100000,
      series_id: body.series_id || null,
    }).then(() => {}).catch(() => {})

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('parse-screenshot error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message?.includes('JSON') ? 'Model returned malformed JSON — try a clearer screenshot.' : 'Parsing failed. Try a clearer screenshot.' }),
      { status: 500 }
    )
  }
}
