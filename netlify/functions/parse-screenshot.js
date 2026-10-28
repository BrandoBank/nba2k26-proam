import Anthropic from '@anthropic-ai/sdk'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'])
const MAX_B64_CHARS = 14_000_000

const SYSTEM_PROMPT = `You are an expert at parsing NBA 2K box score screenshots.

The box score shows two teams. Each team has exactly 5 players listed top-to-bottom: PG, SG, SF, PF, C.

Stat columns (left to right): GRADE | PTS | REB | AST | STL | BLK | PF | TO | FGM-FGA | 3PM-3PA | FTM-FTA

The bottom team may also have a "YOUR MATCHUP" column showing their defensive assignment.

Extract every stat cell precisely:
- Gamertags: copy exactly, including numbers, underscores, capitals
- FG/3P/FT columns show "X/Y" format — split into made and attempted
- Blank or "--" cells = 0
- Grade column: A+, A, A-, B+, B, B-, C+, C, C-, D, F — or null if missing
- 0 vs O: stat columns are digits only

Return ONLY valid JSON — no markdown fences, no explanation:

{
  "team_top": {
    "name": "<team name shown in screenshot>",
    "score": <integer>,
    "players": [
      {
        "position_slot": 1,
        "gamertag": "<exact gamertag>",
        "grade": "<letter grade or null>",
        "pts": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0, "fouls": 0, "tov": 0,
        "fgm": 0, "fga": 0, "tpm": 0, "tpa": 0, "ftm": 0, "fta": 0
      }
    ]
  },
  "team_bottom": {
    "name": "<team name shown in screenshot>",
    "score": <integer>,
    "players": [
      {
        "position_slot": 1,
        "gamertag": "<exact gamertag>",
        "grade": "<letter grade or null>",
        "pts": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0, "fouls": 0, "tov": 0,
        "fgm": 0, "fga": 0, "tpm": 0, "tpa": 0, "ftm": 0, "fta": 0,
        "matchup_gamertag": "<opponent gamertag from YOUR MATCHUP column, or null>"
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
            { type: 'text', text: 'Parse every stat from this box score screenshot and return the JSON.' },
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
