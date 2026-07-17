// Netlify Function: parse-screenshot
// Accepts a base64 image, calls Claude vision, returns structured box score JSON.
// Uses extended thinking + JSON prefill for maximum accuracy.

const Anthropic = require('@anthropic-ai/sdk')

const SYSTEM_PROMPT = `You are an expert at parsing NBA 2K26 Pro-Am box score screenshots.

The box score shows two teams. Each team has exactly 5 players listed top-to-bottom: PG, SG, SF, PF, C.

The stat columns are (left to right):
GRADE | PTS | REB | AST | STL | BLK | PF | TO | FGM-FGA | 3PM-3PA | FTM-FTA

The bottom team also has a "YOUR MATCHUP" column showing their defensive assignment.

Your job: extract every stat cell precisely. Take your time on ambiguous characters:
- The number 1 vs lowercase l vs uppercase I — look at font context
- 0 vs O — box scores use digits only in stat columns
- Gamertags may contain numbers, underscores, capitals — copy exactly
- FG/3P/FT columns show "X/Y" format — split into made (fgm/tpm/ftm) and attempted (fga/tpa/fta)
- Blank or "--" cells = 0
- Grade column shows A+, A, A-, B+, B, etc. or null

Return ONLY a valid JSON object matching this exact schema — no markdown, no explanation:

{
  "team_top": {
    "name": "<team name>",
    "score": <integer>,
    "players": [
      {
        "position_slot": 1,
        "gamertag": "<exact gamertag>",
        "grade": "<letter grade or null>",
        "pts": <int>, "reb": <int>, "ast": <int>,
        "stl": <int>, "blk": <int>, "fouls": <int>, "tov": <int>,
        "fgm": <int>, "fga": <int>,
        "tpm": <int>, "tpa": <int>,
        "ftm": <int>, "fta": <int>
      }
    ]
  },
  "team_bottom": {
    "name": "<team name>",
    "score": <integer>,
    "players": [
      {
        "position_slot": 1,
        "gamertag": "<exact gamertag>",
        "grade": "<letter grade or null>",
        "pts": <int>, "reb": <int>, "ast": <int>,
        "stl": <int>, "blk": <int>, "fouls": <int>, "tov": <int>,
        "fgm": <int>, "fga": <int>,
        "tpm": <int>, "tpa": <int>,
        "ftm": <int>, "fta": <int>,
        "matchup_gamertag": "<opponent gamertag from YOUR MATCHUP column, or null>"
      }
    ]
  },
  "total_check": {
    "team_top_pts_sum": <sum of top team player pts — must equal team score>,
    "team_bottom_pts_sum": <sum of bottom team player pts — must equal team score>
  }
}`

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { image_base64, media_type = 'image/jpeg' } = body
  if (!image_base64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'image_base64 required' }) }
  }

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      thinking: {
        type: 'enabled',
        budget_tokens: 5000,
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type, data: image_base64 },
            },
            {
              type: 'text',
              text: 'Parse every stat from this NBA 2K26 box score screenshot. Think carefully through any ambiguous characters before returning the JSON.',
            },
          ],
        },
        {
          // Prefill — forces pure JSON output from token 1
          role: 'assistant',
          content: '{',
        },
      ],
    })

    // Find the text block (thinking blocks come first, skip them)
    const textBlock = message.content.find(b => b.type === 'text')
    if (!textBlock) throw new Error('No text output from Claude')

    // Reconstruct full JSON (we prefilled the opening brace)
    const raw = '{' + textBlock.text.trim()
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    }
  } catch (err) {
    console.error('Parse error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
