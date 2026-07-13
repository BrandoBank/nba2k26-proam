// Netlify Function: parse-screenshot
// Accepts a base64 image, calls Claude vision, returns structured box score JSON.
// API key stays server-side only.

const Anthropic = require('@anthropic-ai/sdk')

const SYSTEM_PROMPT = `You are parsing an NBA 2K26 Pro-Am box score screenshot.

The box score shows two teams. Each team has exactly 5 players listed top-to-bottom in position order: PG, SG, SF, PF, C.

There is also a "YOUR MATCHUP" column showing who each player on the bottom team was defensively matched against.

Extract ALL of the following and return ONLY valid JSON — no markdown, no explanation:

{
  "team_top": {
    "name": "<team name shown at top of top section>",
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
    "name": "<team name shown at top of bottom section>",
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
        "matchup_gamertag": "<gamertag of the opponent they were matched against, from YOUR MATCHUP column, or null>"
      }
    ]
  },
  "total_check": {
    "team_top_pts_sum": <sum of all top team player pts>,
    "team_bottom_pts_sum": <sum of all bottom team player pts>
  }
}

Rules:
- Read gamertags exactly as shown — preserve capitalization, underscores, numbers.
- If a stat cell is blank or "--", use 0.
- FGM/FGA: parse the "X/Y" format into separate fgm and fga integers.
- Same for 3PM/3PA and FTM/FTA.
- position_slot 1=PG, 2=SG, 3=SF, 4=PF, 5=C based on order in the list.
- The YOUR MATCHUP column only appears for the bottom team rows.
- Return ONLY the JSON object. No extra text.`

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
      max_tokens: 2048,
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
              text: 'Parse this NBA 2K26 box score screenshot and return the JSON.',
            },
          ],
        },
      ],
    })

    const raw = message.content[0].text.trim()

    // Strip markdown code blocks if present
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
