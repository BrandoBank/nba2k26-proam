import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── The Claude prompt template shown to the user ────────────────────────────
const CLAUDE_PROMPT = `You are helping convert NBA 2K26 Pro-Am series history into a structured JSON format for a stat-tracking web app.

I will give you notes about past series. For each series extract:
- Series name, team names, format (3/5/7), result, story/context
- Each game: which game number, score, win/loss
- Each player's stats per game: pts, reb, ast, stl, blk, tov, fgm, fga, tpm, tpa, ftm, fta
- Who the MVP was
- Who drafted the teams (if mentioned)

IMPORTANT RULES:
- Use EXACTLY these position values: "PG", "SG", "SF", "PF", "C"
- Use EXACTLY "our" and "opp" for sides (our = the main group's team)
- Gamertags must match exactly as written — do not clean or normalize them
- If a stat is unknown, use null — never guess
- grades: null if unknown, otherwise "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-"
- series status: "complete" for finished series, "in_progress" for current

Return ONLY valid JSON — no markdown fences, no commentary. Match this EXACT schema:

{
  "series": [
    {
      "name": "Series Name · Context",
      "our_team_name": "Team name",
      "opp_team_name": "Opponent team name",
      "format": 7,
      "our_wins": 4,
      "opp_wins": 2,
      "result_label": "4-2 W",
      "storyline": "Optional narrative about this series",
      "drafted_by": "gamertag of who drafted, or null",
      "status": "complete",
      "started_at": "2025-01-15T00:00:00Z",
      "ended_at": "2025-01-16T00:00:00Z",
      "games": [
        {
          "game_number": 1,
          "our_score": 82,
          "opp_score": 74,
          "our_result": "W",
          "stats": [
            {
              "gamertag": "ExactGamertag",
              "position": "PG",
              "side": "our",
              "pts": 24, "reb": 5, "ast": 8, "stl": 2, "blk": 0, "tov": 1,
              "fgm": 9, "fga": 18, "tpm": 2, "tpa": 5, "ftm": 4, "fta": 4,
              "grade": "A"
            }
          ]
        }
      ],
      "mvp_gamertag": "gamertag of series MVP or null"
    }
  ]
}`

// ─── Import logic ────────────────────────────────────────────────────────────

async function runImport(payload, onLog) {
  const errors = []
  let seriesCreated = 0
  let gamesCreated = 0
  let statsCreated = 0

  for (const serData of payload.series) {
    onLog(`→ Importing series: ${serData.name}`)

    // 1. Collect all gamertags from this series
    const allGamertags = new Set()
    for (const game of (serData.games || [])) {
      for (const stat of (game.stats || [])) {
        if (stat.gamertag) allGamertags.add(stat.gamertag)
      }
    }

    // 2. Ensure all players exist (upsert by gamertag)
    const playerMap = {}
    for (const gtag of allGamertags) {
      const { data: existing } = await supabase
        .from('players').select('id, gamertag').eq('gamertag', gtag).maybeSingle()
      if (existing) {
        playerMap[gtag] = existing.id
      } else {
        const { data: created, error } = await supabase
          .from('players').insert({ gamertag: gtag, display_name: gtag }).select('id').single()
        if (error) { onLog(`  ⚠ Could not create player ${gtag}: ${error.message}`); continue }
        playerMap[gtag] = created.id
        onLog(`  + Created player: ${gtag}`)
      }
    }

    // 3. Create series
    const { data: series, error: serErr } = await supabase.from('series').insert({
      name: serData.name,
      our_team_name: serData.our_team_name || 'Team 1',
      opp_team_name: serData.opp_team_name || 'Team 2',
      format: serData.format || 7,
      our_wins: serData.our_wins || 0,
      opp_wins: serData.opp_wins || 0,
      result_label: serData.result_label || null,
      storyline: serData.storyline || null,
      drafted_by: serData.drafted_by || null,
      status: serData.status || 'complete',
      published: serData.status === 'complete',
      started_at: serData.started_at || null,
      ended_at: serData.ended_at || null,
    }).select('id').single()

    if (serErr) { onLog(`  ✗ Series insert failed: ${serErr.message}`); errors.push(serErr.message); continue }
    seriesCreated++
    onLog(`  ✓ Series created (${series.id.slice(0, 8)}...)`)

    // 4. Create games + stats
    for (const gameData of (serData.games || [])) {
      const { data: game, error: gameErr } = await supabase.from('games').insert({
        series_id: series.id,
        game_number: gameData.game_number,
        our_score: gameData.our_score,
        opp_score: gameData.opp_score,
        our_result: gameData.our_result,
      }).select('id').single()

      if (gameErr) { onLog(`  ✗ Game ${gameData.game_number} insert failed: ${gameErr.message}`); continue }
      gamesCreated++

      // Insert stats
      const statRows = []
      for (const stat of (gameData.stats || [])) {
        const pid = playerMap[stat.gamertag]
        if (!pid) { onLog(`  ⚠ Unknown player in stats: ${stat.gamertag}`); continue }
        statRows.push({
          game_id: game.id,
          player_id: pid,
          side: stat.side,
          position_slot: ['PG','SG','SF','PF','C'].indexOf(stat.position) + 1 || null,
          pts: stat.pts ?? null,
          reb: stat.reb ?? null,
          ast: stat.ast ?? null,
          stl: stat.stl ?? null,
          blk: stat.blk ?? null,
          tov: stat.tov ?? null,
          fgm: stat.fgm ?? null,
          fga: stat.fga ?? null,
          tpm: stat.tpm ?? null,
          tpa: stat.tpa ?? null,
          ftm: stat.ftm ?? null,
          fta: stat.fta ?? null,
          grade: stat.grade ?? null,
        })
      }

      if (statRows.length > 0) {
        const { error: statErr } = await supabase.from('game_stats').insert(statRows)
        if (statErr) { onLog(`  ✗ Stats insert for Game ${gameData.game_number}: ${statErr.message}`) }
        else { statsCreated += statRows.length }
      }
    }

    // 5. Set MVP if provided
    if (serData.mvp_gamertag && playerMap[serData.mvp_gamertag]) {
      await supabase.from('series_rankings').upsert({
        series_id: series.id,
        player_id: playerMap[serData.mvp_gamertag],
        gamertag: serData.mvp_gamertag,
        tier: 'ELITE',
        is_mvp: true,
        finalized: false,
      }, { onConflict: 'series_id,player_id' })
    }
  }

  onLog(`\n✅ Done — ${seriesCreated} series, ${gamesCreated} games, ${statsCreated} stat rows`)
  if (errors.length > 0) onLog(`⚠ ${errors.length} error(s) — check above`)
  return { seriesCreated, gamesCreated, statsCreated, errors }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Import() {
  const { isEditor } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('prompt')
  const [jsonInput, setJsonInput] = useState('')
  const [logs, setLogs] = useState([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [parseError, setParseError] = useState('')

  if (!isEditor) return <div style={s.page}><p style={s.dim}>Editor access required.</p></div>

  function appendLog(msg) {
    setLogs(l => [...l, msg])
  }

  async function startImport() {
    setParseError('')
    setLogs([])
    setDone(false)

    let payload
    try {
      payload = JSON.parse(jsonInput)
    } catch (e) {
      setParseError(`Invalid JSON: ${e.message}`)
      return
    }
    if (!payload.series || !Array.isArray(payload.series)) {
      setParseError('JSON must have a "series" array at the top level.')
      return
    }
    if (payload.series.length === 0) {
      setParseError('No series found in the JSON.')
      return
    }

    setRunning(true)
    appendLog(`Starting import of ${payload.series.length} series...`)
    await runImport(payload, appendLog)
    setRunning(false)
    setDone(true)
  }

  return (
    <div style={s.page}>
      <Link to="/" style={s.back}>← Back</Link>
      <div style={s.header}>
        <h1 style={s.title}>IMPORT HISTORY</h1>
        <p style={s.sub}>Bulk-load series data from your Claude chat notes</p>
      </div>

      <div style={s.tabBar}>
        {[{id:'prompt',label:'1. GET CLAUDE PROMPT'},{id:'import',label:'2. PASTE & IMPORT'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...s.tab, ...(tab === t.id ? s.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'prompt' && (
        <div style={s.section}>
          <p style={s.instructions}>
            Copy the prompt below into Claude and feed it your series notes. Claude will convert them into the right JSON format. Then paste the JSON output into the Import tab.
          </p>
          <div style={s.promptWrap}>
            <div style={s.promptHeader}>
              <span style={s.promptLabel}>CLAUDE PROMPT</span>
              <button style={s.copyBtn} onClick={() => {
                navigator.clipboard.writeText(CLAUDE_PROMPT)
                alert('Prompt copied to clipboard!')
              }}>
                Copy Prompt
              </button>
            </div>
            <pre style={s.promptText}>{CLAUDE_PROMPT}</pre>
          </div>
          <div style={s.tipBox}>
            <div style={s.tipTitle}>💡 Tips for best results</div>
            <ul style={s.tipList}>
              <li>Paste your entire history — past series, box scores, notes, whatever format you have it in</li>
              <li>If you have screenshots or box score photos, describe the numbers in text first</li>
              <li>Tell Claude who was on each team and what side they played (our team vs opponent)</li>
              <li>Mention who the MVP was, who drafted, any storylines worth keeping</li>
              <li>If Claude's output is too long, ask it to continue or split series into batches</li>
            </ul>
          </div>
          <button style={s.nextBtn} onClick={() => setTab('import')}>Next: Paste JSON →</button>
        </div>
      )}

      {tab === 'import' && (
        <div style={s.section}>
          <p style={s.instructions}>
            Paste the JSON that Claude generated. Review it before importing — once created, series cannot be bulk-deleted from this UI.
          </p>
          <textarea
            style={s.textarea}
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            placeholder={'{\n  "series": [\n    {\n      "name": "...",\n      ...\n    }\n  ]\n}'}
            spellCheck={false}
          />
          {parseError && <p style={s.error}>{parseError}</p>}

          {!running && !done && (
            <button
              style={{ ...s.importBtn, opacity: jsonInput.trim() ? 1 : 0.4 }}
              disabled={!jsonInput.trim()}
              onClick={startImport}
            >
              Import Series
            </button>
          )}

          {(running || logs.length > 0) && (
            <div style={s.logWrap}>
              <div style={s.logHeader}>IMPORT LOG</div>
              <pre style={s.logText}>
                {logs.join('\n')}
                {running && '\n⏳ Running...'}
              </pre>
            </div>
          )}

          {done && (
            <div style={s.doneBar}>
              Import complete.{' '}
              <Link to="/history" style={{ color: '#f4701b', textDecoration: 'none', fontWeight: 700 }}>
                View History →
              </Link>
              {' or '}
              <Link to="/leagues" style={{ color: '#f4701b', textDecoration: 'none', fontWeight: 700 }}>
                View Series →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', padding: '2rem', maxWidth: 800, margin: '0 auto', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  back: { color: '#444', textDecoration: 'none', fontSize: '0.82rem', display: 'block', marginBottom: '1.5rem' },
  header: { marginBottom: '1.5rem' },
  title: { margin: '0 0 0.4rem', fontSize: '1.3rem', fontWeight: 900, letterSpacing: '0.12em' },
  sub: { color: '#555', fontSize: '0.85rem', margin: 0 },
  tabBar: { display: 'flex', borderBottom: '1px solid #111', marginBottom: '1.5rem' },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '10px 20px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: '#444', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  tabActive: { color: '#f4701b', borderBottomColor: '#f4701b' },
  section: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  instructions: { color: '#888', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 },
  promptWrap: { border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' },
  promptHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', background: '#0a0a0a', borderBottom: '1px solid #111' },
  promptLabel: { color: '#444', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' },
  copyBtn: { background: '#f4701b', color: '#fff', border: 'none', borderRadius: 4, padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  promptText: { background: '#050505', color: '#aaa', fontSize: '0.78rem', lineHeight: 1.6, padding: '1rem', margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' },
  tipBox: { background: '#080808', border: '1px solid #1a1a1a', borderRadius: 8, padding: '1rem 1.25rem' },
  tipTitle: { fontWeight: 700, color: '#ccc', fontSize: '0.85rem', marginBottom: '0.6rem' },
  tipList: { color: '#666', fontSize: '0.82rem', lineHeight: 1.8, margin: 0, paddingLeft: '1.2rem' },
  nextBtn: { background: '#f4701b', color: '#fff', border: 'none', borderRadius: 6, padding: '0.7rem 1.5rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' },
  textarea: { background: '#080808', border: '1px solid #1a1a1a', borderRadius: 8, color: '#ccc', fontSize: '0.82rem', padding: '1rem', minHeight: 300, resize: 'vertical', fontFamily: 'monospace', width: '100%', outline: 'none', lineHeight: 1.5 },
  error: { color: '#f87171', fontSize: '0.85rem', margin: 0 },
  importBtn: { background: '#f4701b', color: '#fff', border: 'none', borderRadius: 6, padding: '0.75rem 2rem', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' },
  logWrap: { background: '#050505', border: '1px solid #111', borderRadius: 8, overflow: 'hidden' },
  logHeader: { padding: '0.5rem 1rem', background: '#0a0a0a', borderBottom: '1px solid #111', color: '#444', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' },
  logText: { padding: '0.75rem 1rem', margin: 0, color: '#888', fontSize: '0.8rem', lineHeight: 1.7, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace' },
  doneBar: { background: 'rgba(22,163,74,0.08)', border: '1px solid #1a4a1a', borderRadius: 6, padding: '0.75rem 1rem', color: '#4caf50', fontSize: '0.9rem' },
  dim: { color: '#555' },
}
