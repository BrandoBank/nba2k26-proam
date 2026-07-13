import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const STAT_COLS = ['pts','reb','ast','stl','blk','fouls','tov','fgm','fga','tpm','tpa','ftm','fta']
const POSITIONS = ['PG','SG','SF','PF','C']

const emptyPlayer = (slot) => ({
  slot,
  gamertag: '',
  player_id: null,
  grade: '',
  pts:0, reb:0, ast:0, stl:0, blk:0, fouls:0, tov:0,
  fgm:0, fga:0, tpm:0, tpa:0, ftm:0, fta:0,
  matchup_gamertag: '',
})

const emptyGame = (series) => ({
  game_number: '',
  our_score: '',
  opp_score: '',
  our_result: 'W',
  brando_position: 'SG',
  our_players: POSITIONS.map((_, i) => emptyPlayer(i+1)),
  opp_players: POSITIONS.map((_, i) => emptyPlayer(i+1)),
})

export default function GameEntry() {
  const { id: seriesId } = useParams()
  const { isEditor, session } = useAuth()
  const navigate = useNavigate()

  const [series, setSeries] = useState(null)
  const [allPlayers, setAllPlayers] = useState([])
  const [existingGames, setExistingGames] = useState([])
  const [game, setGame] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [screenshotFile, setScreenshotFile] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    if (!isEditor) return
    fetchData()
  }, [seriesId])

  async function fetchData() {
    const [{ data: ser }, { data: players }, { data: games }] = await Promise.all([
      supabase.from('series').select('*').eq('id', seriesId).single(),
      supabase.from('players').select('*').order('gamertag'),
      supabase.from('games').select('game_number').eq('series_id', seriesId),
    ])
    setSeries(ser)
    setAllPlayers(players || [])
    setExistingGames(games || [])
    // Default next game number
    const taken = (games || []).map(g => g.game_number)
    const next = [1,2,3,4,5,6,7].find(n => !taken.includes(n)) || taken.length + 1
    setGame({ ...emptyGame(ser), game_number: next })
  }

  // ── Screenshot drop / upload ──────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return
    setScreenshotFile(file)
    setParseError('')
    setParsing(true)

    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/.netlify/functions/parse-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: file.type }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Parse failed')
      applyParsedData(data)
    } catch (err) {
      setParseError(`AI parse failed: ${err.message}. Fill stats manually below.`)
    } finally {
      setParsing(false)
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function applyParsedData(parsed) {
    // Figure out which team is ours based on team name matching
    const ourName = series.our_team_name.toLowerCase()
    const oppName = series.opp_team_name.toLowerCase()
    const topName = (parsed.team_top?.name || '').toLowerCase()
    const bottomName = (parsed.team_bottom?.name || '').toLowerCase()

    let ourParsed, oppParsed
    // Try to match by name similarity
    const topMatchesOurs = ourName.includes(topName.slice(0,4)) || topName.includes(ourName.slice(0,4))
    if (topMatchesOurs) {
      ourParsed = parsed.team_top
      oppParsed = parsed.team_bottom
    } else {
      ourParsed = parsed.team_bottom
      oppParsed = parsed.team_top
    }

    const mapPlayer = (pp, idx) => {
      const existing = allPlayers.find(p => p.gamertag.toLowerCase() === pp.gamertag.toLowerCase())
      return {
        slot: idx + 1,
        gamertag: pp.gamertag,
        player_id: existing?.id || null,
        grade: pp.grade || '',
        pts: pp.pts || 0, reb: pp.reb || 0, ast: pp.ast || 0,
        stl: pp.stl || 0, blk: pp.blk || 0, fouls: pp.fouls || 0, tov: pp.tov || 0,
        fgm: pp.fgm || 0, fga: pp.fga || 0,
        tpm: pp.tpm || 0, tpa: pp.tpa || 0,
        ftm: pp.ftm || 0, fta: pp.fta || 0,
        matchup_gamertag: pp.matchup_gamertag || '',
      }
    }

    const ourResult = ourParsed.score > oppParsed.score ? 'W' : 'L'

    setGame(g => ({
      ...g,
      our_score: ourParsed.score,
      opp_score: oppParsed.score,
      our_result: ourResult,
      our_players: (ourParsed.players || []).map(mapPlayer),
      opp_players: (oppParsed.players || []).map(mapPlayer),
    }))
  }

  // ── Validation ────────────────────────────────────────────────────────
  const ourPtsSum = game ? game.our_players.reduce((a,p) => a + Number(p.pts||0), 0) : 0
  const oppPtsSum = game ? game.opp_players.reduce((a,p) => a + Number(p.pts||0), 0) : 0
  const ourMatch = game && ourPtsSum === Number(game.our_score)
  const oppMatch = game && oppPtsSum === Number(game.opp_score)
  const totalsOk = ourMatch && oppMatch
  const [overrideTotal, setOverrideTotal] = useState(false)

  const duplicateGame = game && existingGames.some(g => g.game_number === Number(game.game_number))

  // ── Save ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!totalsOk && !overrideTotal) return
    if (duplicateGame) { setSaveError(`Game ${game.game_number} already exists in this series.`); return }
    setSaving(true)
    setSaveError('')

    try {
      // 1. Create/find any new players
      const allRows = [...game.our_players, ...game.opp_players]
      const playerMap = {}
      for (const row of allRows) {
        if (!row.gamertag.trim()) continue
        const existing = allPlayers.find(p => p.gamertag.toLowerCase() === row.gamertag.toLowerCase())
        if (existing) { playerMap[row.gamertag] = existing.id; continue }
        // Create new player
        const { data: newP, error } = await supabase.from('players')
          .insert({ gamertag: row.gamertag.trim(), default_position: POSITIONS[row.slot - 1] })
          .select().single()
        if (error) throw new Error(`Failed to create player ${row.gamertag}: ${error.message}`)
        playerMap[row.gamertag] = newP.id
        setAllPlayers(prev => [...prev, newP])
      }

      // 2. Insert game row
      const { data: gameRow, error: gameErr } = await supabase.from('games').insert({
        series_id: seriesId,
        game_number: Number(game.game_number),
        our_score: Number(game.our_score),
        opp_score: Number(game.opp_score),
        our_result: game.our_result,
        brando_position: game.brando_position || null,
        played_at: new Date().toISOString(),
      }).select().single()
      if (gameErr) throw new Error(gameErr.message)

      // 3. Insert game_stats rows
      const statsRows = [
        ...game.our_players.filter(p => p.gamertag.trim()).map(p => ({
          game_id: gameRow.id, player_id: playerMap[p.gamertag], side: 'our',
          grade: p.grade || null,
          pts: +p.pts, reb: +p.reb, ast: +p.ast, stl: +p.stl, blk: +p.blk,
          fouls: +p.fouls, tov: +p.tov, fgm: +p.fgm, fga: +p.fga,
          tpm: +p.tpm, tpa: +p.tpa, ftm: +p.ftm, fta: +p.fta,
        })),
        ...game.opp_players.filter(p => p.gamertag.trim()).map(p => ({
          game_id: gameRow.id, player_id: playerMap[p.gamertag], side: 'opp',
          grade: p.grade || null,
          pts: +p.pts, reb: +p.reb, ast: +p.ast, stl: +p.stl, blk: +p.blk,
          fouls: +p.fouls, tov: +p.tov, fgm: +p.fgm, fga: +p.fga,
          tpm: +p.tpm, tpa: +p.tpa, ftm: +p.ftm, fta: +p.fta,
        })),
      ]
      const { error: statsErr } = await supabase.from('game_stats').insert(statsRows)
      if (statsErr) throw new Error(statsErr.message)

      // 4. Insert matchups (from our players' matchup_gamertag field + opp players with matchup)
      const matchupRows = []
      const allPlayerRows = [...game.our_players, ...game.opp_players]
      for (const p of allPlayerRows) {
        if (!p.gamertag.trim() || !p.matchup_gamertag?.trim()) continue
        const defId = playerMap[p.gamertag]
        const offExisting = allPlayers.find(pl => pl.gamertag.toLowerCase() === p.matchup_gamertag.toLowerCase())
        const offId = offExisting?.id || playerMap[p.matchup_gamertag]
        if (defId && offId) {
          matchupRows.push({ game_id: gameRow.id, defender_player_id: defId, offensive_player_id: offId })
        }
      }
      if (matchupRows.length > 0) {
        await supabase.from('game_matchups').insert(matchupRows)
      }

      // 5. Update series win/loss counts
      const newWins = existingGames.filter(g => g.our_result === 'W').length + (game.our_result === 'W' ? 1 : 0)
      const newLosses = existingGames.filter(g => g.our_result === 'L').length + (game.our_result === 'L' ? 1 : 0)
      await supabase.from('series').update({ our_wins: newWins, opp_wins: newLosses }).eq('id', seriesId)

      navigate(`/series/${seriesId}`)
    } catch (err) {
      setSaveError(err.message)
      setSaving(false)
    }
  }

  // ── Player row updater ────────────────────────────────────────────────
  function updatePlayer(side, slot, field, value) {
    setGame(g => ({
      ...g,
      [`${side}_players`]: g[`${side}_players`].map(p =>
        p.slot === slot ? { ...p, [field]: value } : p
      )
    }))
  }

  if (!isEditor) return <div style={s.page}><p style={s.dim}>Editor access required.</p></div>
  if (!game) return <div style={s.page}><p style={s.dim}>Loading...</p></div>

  return (
    <div style={s.page}>
      <Link to={`/series/${seriesId}`} style={s.back}>← Back to Series</Link>
      <h1 style={s.title}>Add Game — {series?.name}</h1>

      {/* Screenshot drop zone */}
      <div
        style={{...s.dropZone, borderColor: dragOver ? '#1d6ef5' : '#2a2a2a', background: dragOver ? '#0a1a2a' : '#080808'}}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e => handleFile(e.target.files[0])} />
        {parsing ? (
          <div style={s.dropText}>Parsing screenshot with AI...</div>
        ) : screenshotFile ? (
          <div style={s.dropText}>✓ {screenshotFile.name} — stats loaded below. Verify and save.</div>
        ) : (
          <div style={s.dropText}>
            Drop box score screenshot here or <span style={{color:'#1d6ef5'}}>click to upload</span>
            <div style={s.dropSub}>AI will parse all stats + matchups automatically</div>
          </div>
        )}
      </div>
      {parseError && <p style={s.error}>{parseError}</p>}

      {/* Game header fields */}
      <div style={s.row}>
        <label style={s.label}>Game #
          <select style={s.input} value={game.game_number} onChange={e => setGame(g => ({...g, game_number: +e.target.value}))}>
            {[1,2,3,4,5,6,7].filter(n => !existingGames.some(g => g.game_number === n) || n === game.game_number).map(n => (
              <option key={n} value={n}>Game {n}</option>
            ))}
          </select>
        </label>
        <label style={s.label}>Result
          <select style={s.input} value={game.our_result} onChange={e => setGame(g => ({...g, our_result: e.target.value}))}>
            <option value="W">W (We Won)</option>
            <option value="L">L (We Lost)</option>
          </select>
        </label>
        <label style={s.label}>Our Score
          <input style={s.input} type="number" min={0} value={game.our_score} onChange={e => setGame(g => ({...g, our_score: e.target.value}))} />
        </label>
        <label style={s.label}>Their Score
          <input style={s.input} type="number" min={0} value={game.opp_score} onChange={e => setGame(g => ({...g, opp_score: e.target.value}))} />
        </label>
        <label style={s.label}>Brando Position
          <select style={s.input} value={game.brando_position} onChange={e => setGame(g => ({...g, brando_position: e.target.value}))}>
            {POSITIONS.map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
      </div>

      {/* Team total validation */}
      <div style={s.totalsBar}>
        <TotalCheck label={`${series?.our_team_name || 'Our'} PTS`} sum={ourPtsSum} score={Number(game.our_score)} ok={ourMatch} />
        <TotalCheck label={`${series?.opp_team_name || 'Opp'} PTS`} sum={oppPtsSum} score={Number(game.opp_score)} ok={oppMatch} />
        {!totalsOk && (
          <label style={s.overrideLabel}>
            <input type="checkbox" checked={overrideTotal} onChange={e => setOverrideTotal(e.target.checked)} />
            <span style={{marginLeft:6, color:'#ffc107'}}>Override (stat totals don't match — acknowledge discrepancy)</span>
          </label>
        )}
      </div>

      {/* Duplicate warning */}
      {duplicateGame && (
        <div style={s.warnBanner}>⚠ Game {game.game_number} already exists in this series. Choose a different game number.</div>
      )}

      {/* Stat grids */}
      <PlayerGrid
        title={`${series?.our_team_name || 'Our Team'}`}
        side="our"
        players={game.our_players}
        allPlayers={allPlayers}
        teamColor="#4da6ff"
        onChange={updatePlayer}
        showMatchup={false}
      />
      <PlayerGrid
        title={`${series?.opp_team_name || 'Opponent'}`}
        side="opp"
        players={game.opp_players}
        allPlayers={allPlayers}
        teamColor="#ff6b6b"
        onChange={updatePlayer}
        showMatchup={true}
      />

      {saveError && <p style={s.error}>{saveError}</p>}

      <button
        onClick={handleSave}
        disabled={saving || duplicateGame || (!totalsOk && !overrideTotal)}
        style={{...s.btnSave, opacity: (saving || duplicateGame || (!totalsOk && !overrideTotal)) ? 0.4 : 1}}
      >
        {saving ? 'Saving...' : 'Save Game'}
      </button>
    </div>
  )
}

function TotalCheck({ label, sum, score, ok }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:8}}>
      <span style={{color:'#666', fontSize:'0.8rem'}}>{label}:</span>
      <span style={{color:'#fff', fontSize:'0.9rem', fontWeight:600}}>Σ{sum} / {score || '?'}</span>
      <span style={{fontSize:'1rem'}}>{ok ? '✅' : '❌'}</span>
    </div>
  )
}

function PlayerGrid({ title, side, players, allPlayers, teamColor, onChange, showMatchup }) {
  return (
    <div style={{marginBottom: '2rem'}}>
      <div style={{color: teamColor, fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', marginTop: '1.5rem'}}>{title}</div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.82rem'}}>
          <thead>
            <tr>
              <th style={gs.th}>POS</th>
              <th style={{...gs.th, minWidth:140}}>GAMERTAG</th>
              <th style={gs.th}>GRD</th>
              {['PTS','REB','AST','STL','BLK','FOUL','TOV','FGM','FGA','3PM','3PA','FTM','FTA'].map(h => (
                <th key={h} style={gs.th}>{h}</th>
              ))}
              {showMatchup && <th style={{...gs.th, minWidth:130}}>GUARDED</th>}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.slot}>
                <td style={gs.pos}>{POSITIONS[i]}</td>
                <td style={gs.td}>
                  <GamertагInput
                    value={p.gamertag}
                    allPlayers={allPlayers}
                    onChange={v => onChange(side, p.slot, 'gamertag', v)}
                  />
                </td>
                <td style={gs.td}>
                  <input style={gs.small} maxLength={3} value={p.grade} onChange={e => onChange(side, p.slot, 'grade', e.target.value)} placeholder="A+" />
                </td>
                {STAT_COLS.map(col => (
                  <td key={col} style={gs.td}>
                    <input
                      style={gs.num}
                      type="number" min={0}
                      value={p[col]}
                      onChange={e => onChange(side, p.slot, col, e.target.value)}
                    />
                  </td>
                ))}
                {showMatchup && (
                  <td style={gs.td}>
                    <GamertагInput
                      value={p.matchup_gamertag}
                      allPlayers={allPlayers}
                      onChange={v => onChange(side, p.slot, 'matchup_gamertag', v)}
                      placeholder="Guarded..."
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GamertагInput({ value, allPlayers, onChange, placeholder }) {
  const [focused, setFocused] = useState(false)
  const filtered = value.length >= 1
    ? allPlayers.filter(p => p.gamertag.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
    : []
  const showDropdown = focused && filtered.length > 0

  return (
    <div style={{position:'relative'}}>
      <input
        style={gs.gTag}
        value={value}
        placeholder={placeholder || 'Gamertag...'}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown && (
        <div style={gs.dropdown}>
          {filtered.map(p => (
            <div key={p.id} style={gs.dropItem} onMouseDown={() => onChange(p.gamertag)}>
              {p.gamertag}
              {p.display_name && <span style={{color:'#555', marginLeft:6}}>({p.display_name})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s = {
  page: { minHeight:'100vh', background:'#000', color:'#fff', padding:'2rem', maxWidth:1200, margin:'0 auto' },
  back: { color:'#555', textDecoration:'none', fontSize:'0.82rem', display:'block', marginBottom:'1.5rem' },
  title: { margin:'0 0 1.5rem', fontSize:'1.3rem', letterSpacing:'0.08em' },
  dropZone: { border:'2px dashed', borderRadius:8, padding:'2rem', textAlign:'center', cursor:'pointer', marginBottom:'1.5rem', transition:'all 0.15s' },
  dropText: { color:'#ccc', fontSize:'0.95rem' },
  dropSub: { color:'#555', fontSize:'0.8rem', marginTop:'0.4rem' },
  row: { display:'flex', gap:'1rem', flexWrap:'wrap', marginBottom:'1rem' },
  label: { display:'flex', flexDirection:'column', gap:'0.3rem', color:'#666', fontSize:'0.75rem', textTransform:'uppercase', letterSpacing:'0.08em' },
  input: { background:'#0d0d0d', border:'1px solid #2a2a2a', borderRadius:4, color:'#fff', padding:'0.5rem 0.7rem', fontSize:'0.9rem', outline:'none' },
  totalsBar: { display:'flex', gap:'1.5rem', alignItems:'center', background:'#080808', border:'1px solid #1a1a1a', borderRadius:6, padding:'0.75rem 1rem', marginBottom:'1rem', flexWrap:'wrap' },
  overrideLabel: { display:'flex', alignItems:'center', cursor:'pointer', fontSize:'0.82rem' },
  warnBanner: { background:'#2a1a00', border:'1px solid #5a3500', borderRadius:4, padding:'0.6rem 1rem', color:'#ffc107', fontSize:'0.85rem', marginBottom:'1rem' },
  btnSave: { background:'#1d6ef5', color:'#fff', border:'none', borderRadius:4, padding:'0.85rem 2rem', fontSize:'1rem', fontWeight:700, cursor:'pointer', marginTop:'1rem' },
  error: { color:'#e55', fontSize:'0.85rem' },
  dim: { color:'#555' },
}

const gs = {
  th: { color:'#444', fontWeight:600, fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.06em', padding:'0.35rem 0.5rem', textAlign:'left', borderBottom:'1px solid #1a1a1a', whiteSpace:'nowrap' },
  td: { padding:'0.35rem 0.4rem', borderBottom:'1px solid #0d0d0d', position:'relative' },
  pos: { color:'#555', fontSize:'0.78rem', fontWeight:700, padding:'0.35rem 0.5rem', borderBottom:'1px solid #0d0d0d' },
  num: { background:'#0d0d0d', border:'1px solid #1e1e1e', borderRadius:3, color:'#fff', padding:'0.3rem', width:48, fontSize:'0.85rem', textAlign:'center', outline:'none' },
  small: { background:'#0d0d0d', border:'1px solid #1e1e1e', borderRadius:3, color:'#fff', padding:'0.3rem', width:42, fontSize:'0.85rem', outline:'none' },
  gTag: { background:'#0d0d0d', border:'1px solid #1e1e1e', borderRadius:3, color:'#fff', padding:'0.3rem 0.5rem', width:130, fontSize:'0.82rem', outline:'none' },
  dropdown: { position:'absolute', top:'100%', left:0, background:'#141414', border:'1px solid #2a2a2a', borderRadius:4, zIndex:100, minWidth:160, boxShadow:'0 4px 12px rgba(0,0,0,0.5)' },
  dropItem: { padding:'0.4rem 0.7rem', cursor:'pointer', fontSize:'0.82rem', color:'#ccc', borderBottom:'1px solid #1e1e1e' },
}
