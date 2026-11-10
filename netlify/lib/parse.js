/**
 * Box score parsing — Claude vision → structured JSON, validated against the
 * screenshot's own TOTAL rows, with one targeted re-read when a check fails.
 */

export const PARSE_MODEL = process.env.PARSE_MODEL || 'claude-opus-5-5'

// $/1M tokens, used only for the api_usage cost log
const PRICING = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
}
export function estimateCost(model, usage) {
  const [i, o] = PRICING[model] || [4, 20]
  return ((usage.input_tokens || 0) * i + (usage.output_tokens || 0) * o) / 1_000_000
}

export const STAT_COLS = ['pts', 'reb', 'ast', 'stl', 'blk', 'fouls', 'tov', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta']

const SYSTEM_PROMPT = `You transcribe NBA 2K "GAME STATS" box score screenshots into JSON. Copy exactly what is printed — never infer or estimate.

Layout:
- Screenshots are often phone captures: the box score is a band in the middle of the image with black space above and below. Ignore everything outside the GAME STATS panel.
- Two team sections, top and bottom. Each starts with a header row: team name, then the column labels GRD PTS REB AST STL BLK FOULS TO FGM/FGA 3PM/3PA FTM/FTA.
- Team names are unreliable (both sections can show the same name). Copy them anyway.
- 3 to 5 player rows per team, then a TOTAL row.
- The big numbers on the left are each team's final score, with quarter scores beside them. The top score belongs to the top section.
- A green arrow before a gamertag marks "YOU"; a red arrow marks "YOUR MATCHUP". A yellow highlighted row is just the cursor — ignore the highlight.

Gamertags: read character by character. They are case-sensitive and mix letters, digits and underscores. Distinguish 0/O, 1/l/I, 5/S, 2/Z, 8/B. Keep every underscore. Never correct spelling.

Stats: "X/Y" cells are made/attempted. Blank or "--" means 0. Grade is copied exactly (A+, A, A-, B+ … F), or null if absent.

Self-check before answering — fix any row that fails:
- each player: pts = 2×FGM + 3PM + FTM, FGM ≤ FGA, 3PM ≤ 3PA, 3PM ≤ FGM, FTM ≤ FTA
- each column of player rows sums to that team's TOTAL row
- TOTAL pts equals the team's final score`

const statProps = Object.fromEntries(STAT_COLS.map(c => [c, { type: 'integer' }]))
const teamSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'score', 'players', 'totals'],
  properties: {
    name: { type: 'string' },
    score: { type: 'integer' },
    players: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['gamertag', 'grade', 'marker', ...STAT_COLS],
        properties: {
          gamertag: { type: 'string' },
          grade: { type: ['string', 'null'] },
          marker: { type: 'string', enum: ['you', 'matchup', 'none'] },
          ...statProps,
        },
      },
    },
    totals: { type: 'object', additionalProperties: false, required: STAT_COLS, properties: statProps },
  },
}
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['team_top', 'team_bottom'],
  properties: { team_top: teamSchema, team_bottom: teamSchema },
}

/** Every internal-consistency check the screenshot itself lets us make. */
export function validateBoxScore(parsed) {
  const issues = []
  for (const key of ['team_top', 'team_bottom']) {
    const team = parsed?.[key]
    const label = key === 'team_top' ? 'top team' : 'bottom team'
    if (!team?.players?.length) { issues.push(`${label}: no player rows`); continue }
    for (const p of team.players) {
      const who = `${label} ${p.gamertag}`
      if (p.fgm > p.fga) issues.push(`${who}: FGM ${p.fgm} > FGA ${p.fga}`)
      if (p.tpm > p.tpa) issues.push(`${who}: 3PM ${p.tpm} > 3PA ${p.tpa}`)
      if (p.ftm > p.fta) issues.push(`${who}: FTM ${p.ftm} > FTA ${p.fta}`)
      if (p.tpm > p.fgm) issues.push(`${who}: 3PM ${p.tpm} > FGM ${p.fgm}`)
      const expect = 2 * p.fgm + p.tpm + p.ftm
      if (expect !== p.pts) issues.push(`${who}: PTS ${p.pts} but 2×${p.fgm} FGM + ${p.tpm} 3PM + ${p.ftm} FTM = ${expect}`)
    }
    if (team.totals) {
      for (const c of STAT_COLS) {
        const sum = team.players.reduce((a, p) => a + (p[c] || 0), 0)
        if (sum !== team.totals[c]) issues.push(`${label}: ${c.toUpperCase()} column sums to ${sum} but TOTAL row says ${team.totals[c]}`)
      }
      if (team.totals.pts !== team.score) issues.push(`${label}: TOTAL PTS ${team.totals.pts} ≠ final score ${team.score}`)
    }
  }
  return issues
}

function readJson(message) {
  const text = message.content.find(b => b.type === 'text')?.text
  if (!text) throw new Error(`No text output (stop_reason: ${message.stop_reason})`)
  return JSON.parse(text)
}

/**
 * Parse a screenshot. Returns { parsed, issues, attempts, usage, model }.
 * `issues` is empty when every check passes; otherwise it lists what the
 * reviewer should look at.
 */
export async function parseBoxScore({ client, base64, mediaType, model = PARSE_MODEL }) {
  const usage = { input_tokens: 0, output_tokens: 0 }
  const add = u => { usage.input_tokens += u?.input_tokens || 0; usage.output_tokens += u?.output_tokens || 0 }

  const messages = [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: 'Transcribe this box score.' },
    ],
  }]
  const request = () => client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages,
  })

  let message = await request()
  add(message.usage)
  let parsed = readJson(message)
  let issues = validateBoxScore(parsed)
  let attempts = 1

  if (issues.length) {
    // One targeted re-read: tell the model exactly which cells don't reconcile
    // Pass the assistant turn back unchanged (thinking blocks included)
    messages.push({ role: 'assistant', content: message.content })
    messages.push({
      role: 'user',
      content: `These checks fail against your transcription:\n- ${issues.join('\n- ')}\n\nLook at those rows and columns in the screenshot again and return the full corrected JSON. Only change cells you misread — the screenshot is the source of truth.`,
    })
    message = await request()
    add(message.usage)
    attempts = 2
    const retry = readJson(message)
    const retryIssues = validateBoxScore(retry)
    if (retryIssues.length <= issues.length) { parsed = retry; issues = retryIssues }
  }

  return { parsed, issues, attempts, usage, model }
}
