import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { IconCheck, IconX, IconWarn } from '../lib/icons'
import { cropBoxScore } from '../lib/cropBoxScore'

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

const todayISO = () => new Date().toISOString().slice(0, 10)

const emptyGame = (series) => ({
  game_number: '',
  our_score: '',
  opp_score: '',
  our_result: 'W',
  played_at: todayISO(),
  our_players: POSITIONS.map((_, i) => emptyPlayer(i+1)),
  opp_players: POSITIONS.map((_, i) => emptyPlayer(i+1)),
})

export default function GameEntry() {
  const { id: seriesId } = useParams()
  const { isEditor, session, gamertag, loading: authLoading, gamertagLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const submissionId = searchParams.get('submission')
  // Three modes: commissioner direct entry, commissioner reviewing a submission,
  // or a contributor submitting for review.
  const reviewMode = isEditor && !!submissionId
  const contributorMode = !isEditor && !!session && !!gamertag

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
  const [image, setImage] = useState(null) // { base64, type, hash, previewUrl }
  const [submission, setSubmission] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [parseInfo, setParseInfo] = useState(null) // { issues, corrections, new_players, side_reason, marked_matchup }
  const fileRef = useRef()

  useEffect(() => {
    if (authLoading || gamertagLoading) return
    fetchData()
  }, [seriesId, submissionId, authLoading, gamertagLoading, isEditor])

  async function authHeaders() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      ...(currentSession?.access_token ? { 'Authorization': `Bearer ${currentSession.access_token}` } : {}),
    }
  }

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

    if (submissionId && isEditor) {
      const res = await fetch('/.netlify/functions/review-submission', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ action: 'get', id: submissionId }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error || 'Could not load submission'); setGame({ ...emptyGame(ser), game_number: next }); return }
      const sub = data.submission
      const pad = (rows) => [...(rows || []), ...POSITIONS.map((_, i) => emptyPlayer(i + 1))].slice(0, Math.max(5, (rows || []).length))
        .map((p, i) => ({ ...emptyPlayer(i + 1), ...p, slot: i + 1, grade: p.grade || '', matchup_gamertag: p.matchup_gamertag || '' }))
      setSubmission(sub)
      setGame({
        ...emptyGame(ser),
        game_number: sub.game_number,
        our_score: sub.payload.our_score,
        opp_score: sub.payload.opp_score,
        our_result: sub.payload.our_result,
        played_at: (sub.payload.played_at || todayISO()).slice(0, 10),
        our_players: pad(sub.payload.our_players),
        opp_players: pad(sub.payload.opp_players),
      })
      return
    }
    setGame({ ...emptyGame(ser), game_number: next })
  }

  // ── Screenshot drop / upload ──────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return
    setScreenshotFile(file)
    setImage(null)
    setParseError('')
    setSaveError('')
    setParsing(true)

    try {
      const base64 = await fileToBase64(file)
      // Trim phone letterboxing so the stats are read at full resolution
      const cropped = await cropBoxScore(file)
      const res = await fetch('/.netlify/functions/parse-screenshot', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          image_base64: base64, media_type: file.type, series_id: seriesId,
          ...(cropped ? { parse_base64: cropped.base64, parse_media_type: cropped.type } : {}),
        }),
      })
      const data = await res.json()
      if (data.error === 'duplicate_image') {
        setScreenshotFile(null)
        setParseError(`Duplicate picture — ${data.message}`)
        return
      }
      if (!res.ok || data.error) throw new Error(data.error || 'Parse failed')
      setImage({ base64, type: file.type, hash: data.image_hash, previewUrl: URL.createObjectURL(file) })
      applyParsedData(data)
    } catch (err) {
      setParseError(`AI parse failed: ${err.message}. ${isEditor ? 'Fill stats manually below.' : 'Try a clearer screenshot.'}`)
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
    // Server already decided sides from rosters and snapped tags to known players
    const mapPlayer = (pp, idx) => {
      const existing = allPlayers.find(p => p.gamertag.toLowerCase() === pp.gamertag.toLowerCase())
      return {
        ...emptyPlayer(idx + 1),
        gamertag: pp.gamertag,
        player_id: existing?.id || null,
        grade: pp.grade || '',
        ...Object.fromEntries(STAT_COLS.map(c => [c, pp[c] || 0])),
      }
    }
    setParseInfo({
      issues: parsed.issues || [],
      corrections: parsed.corrections || [],
      new_players: parsed.new_players || [],
      side_reason: parsed.side_reason,
      marked_matchup: parsed.marked_matchup || null,
    })
    setGame(g => ({
      ...g,
      our_score: parsed.ours.score,
      opp_score: parsed.opp.score,
      our_result: parsed.ours.score > parsed.opp.score ? 'W' : 'L',
      our_players: (parsed.ours.players || []).map(mapPlayer),
      opp_players: (parsed.opp.players || []).map(mapPlayer),
    }))
  }

  function swapSides() {
    setGame(g => ({
      ...g,
      our_score: g.opp_score, opp_score: g.our_score,
      our_result: Number(g.opp_score) > Number(g.our_score) ? 'W' : 'L',
      our_players: g.opp_players, opp_players: g.our_players,
    }))
    setParseInfo(pi => pi && { ...pi, side_reason: 'swapped by hand' })
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
  const [duplicateWarning, setDuplicateWarning] = useState(null)

  async function handleSave(force = false) {
    if (!totalsOk && !overrideTotal) return
    if (duplicateGame) { setSaveError(`Game ${game.game_number} already exists in this series.`); return }
    if (contributorMode && !image) { setSaveError('Upload the box score screenshot first.'); return }
    setSaving(true)
    setSaveError('')
    setDuplicateWarning(null)

    const gameFields = {
      game_number: Number(game.game_number),
      our_score: Number(game.our_score),
      opp_score: Number(game.opp_score),
      our_result: game.our_result,
      played_at: game.played_at || new Date().toISOString(),
      our_players: game.our_players,
      opp_players: game.opp_players,
      // Only when this page parsed the image — in review mode the stored value stands
      ...(parseInfo ? { marked_matchup: parseInfo.marked_matchup || null } : {}),
    }
    let endpoint, payload
    if (reviewMode) {
      endpoint = 'review-submission'
      payload = { action: 'approve', id: submissionId, payload: gameFields }
    } else if (contributorMode) {
      endpoint = 'submit-game'
      payload = { series_id: seriesId, ...gameFields, image_base64: image.base64, media_type: image.type }
    } else {
      endpoint = 'add-game'
      payload = { series_id: seriesId, ...gameFields, image_hash: image?.hash }
    }

    try {
      const res = await fetch(`/.netlify/functions/${endpoint}`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ ...payload, ...(force ? { force: true } : {}) }),
      })
      const data = await res.json()
      const softDup = data.error === 'duplicate_score' || (data.error === 'duplicate_stats' && !contributorMode)
      if (res.status === 409 && softDup) {
        // Commissioner can force through a same-score / same-stat-line game
        setDuplicateWarning(data.message)
        setSaving(false)
        return
      }
      if (!res.ok) throw new Error(data.message || data.error || 'Save failed')
      if (contributorMode) { setSubmitted(true); setSaving(false); return }
      navigate(reviewMode ? '/review' : `/series/${seriesId}`)
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

  if (!game || authLoading || gamertagLoading) return <div style={s.page}><p style={s.dim}>Loading...</p></div>
  if (!isEditor && !contributorMode) return (
    <div style={s.page}>
      <p style={s.dim}>{session ? 'Claim your player profile to submit games.' : 'Sign in to submit games.'}</p>
      <Link to={session ? '/claim' : '/login'} style={{color:'#f4701b'}}>{session ? 'Claim profile →' : 'Sign in →'}</Link>
    </div>
  )
  if (contributorMode && series && series.status === 'complete') return (
    <div style={s.page}><p style={s.dim}>This series is complete — no more submissions.</p></div>
  )

  if (submitted) return (
    <div style={s.page}>
      <div style={s.doneCard}>
        <IconCheck size={28} color="#4ade80" />
        <h2 style={{margin:'0.75rem 0 0.4rem', fontSize:'1.15rem'}}>Game {game.game_number} submitted</h2>
        <p style={{color:'#888', fontSize:'0.88rem', margin:0}}>The commissioner will verify it against the screenshot. It goes live once approved.</p>
        <div style={{display:'flex', gap:'0.75rem', justifyContent:'center', marginTop:'1.25rem'}}>
          <Link to={`/series/${seriesId}`} style={s.doneLink}>Back to series</Link>
          <button style={s.doneBtn} onClick={() => { setSubmitted(false); setImage(null); setScreenshotFile(null); setOverrideTotal(false); fetchData() }}>Submit another</button>
        </div>
      </div>
    </div>
  )

  const previewUrl = reviewMode ? submission?.image_url : image?.previewUrl
  const saveLabel = reviewMode ? 'Approve & Publish Game' : contributorMode ? 'Submit for Review' : 'Save Game'

  return (
    <div style={s.page}>
      <Link to={reviewMode ? '/review' : `/series/${seriesId}`} style={s.back}>← Back to {reviewMode ? 'Review Queue' : 'Series'}</Link>
      <h1 style={s.title}>{reviewMode ? 'Review' : contributorMode ? 'Submit' : 'Add'} Game — {series?.name}</h1>

      {reviewMode && submission && (
        <div style={s.infoBanner}>
          Submitted by <b style={{color:'#fff'}}>{submission.players?.gamertag || 'unknown'}</b> · {new Date(submission.created_at).toLocaleString()} — check every number against the screenshot, fix anything off, then approve.
        </div>
      )}
      {contributorMode && (
        <div style={s.infoBanner}>
          Upload the box score screenshot — AI fills in the stats. Double-check them, then submit. The commissioner verifies every game before it goes live. Each picture can only be uploaded once.
        </div>
      )}

      {previewUrl && (
        <a href={previewUrl} target="_blank" rel="noreferrer" style={{display:'block', marginBottom:'1.25rem'}}>
          <img src={previewUrl} alt="Box score screenshot" style={s.preview} />
        </a>
      )}

      {/* Screenshot drop zone */}
      {!reviewMode && <div
        style={{...s.dropZone, borderColor: dragOver ? '#f4701b' : '#2a2a2a', background: dragOver ? '#1a0a2e' : '#080808'}}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e => handleFile(e.target.files[0])} />
        {parsing ? (
          <div style={s.dropText}>Parsing screenshot with AI...</div>
        ) : screenshotFile ? (
          <div style={{...s.dropText, display:'flex', alignItems:'center', gap:6}}><IconCheck size={14} color="#4ade80" /> {screenshotFile.name} — stats loaded below. Verify and save.</div>
        ) : (
          <div style={s.dropText}>
            Drop box score screenshot here or <span style={{color:'#f4701b'}}>click to upload</span>
            <div style={s.dropSub}>AI will parse all stats + matchups automatically</div>
          </div>
        )}
      </div>}
      {parseError && <p style={s.error}>{parseError}</p>}
      {parseInfo && <ParseReport info={parseInfo} onSwap={swapSides} ourName={series?.our_team_name} />}

      {/* Game header fields */}
      <div style={s.row}>
        <label style={s.label}>Game #
          <select style={s.input} value={game.game_number} onChange={e => setGame(g => ({...g, game_number: +e.target.value}))}>
            {[1,2,3,4,5,6,7].filter(n => !existingGames.some(g => g.game_number === n) || n === game.game_number).map(n => (
              <option key={n} value={n}>Game {n}</option>
            ))}
          </select>
        </label>
        <label style={s.label}>Date Played
          <input style={s.input} type="date" value={game.played_at || todayISO()} onChange={e => setGame(g => ({...g, played_at: e.target.value}))} />
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
      </div>

      {/* Team total validation */}
      <div style={s.totalsBar}>
        <TotalCheck label={`${series?.our_team_name || 'Our'} PTS`} sum={ourPtsSum} score={Number(game.our_score)} ok={ourMatch} />
        <TotalCheck label={`${series?.opp_team_name || 'Opp'} PTS`} sum={oppPtsSum} score={Number(game.opp_score)} ok={oppMatch} />
        {!totalsOk && (
          <label style={{...s.overrideLabel, background:'#1a1200', border:'1px solid #4a3000', borderRadius:5, padding:'0.5rem 0.75rem', marginTop:4}}>
            <input type="checkbox" checked={overrideTotal} onChange={e => setOverrideTotal(e.target.checked)} style={{width:16,height:16,cursor:'pointer',accentColor:'#f4701b'}} />
            <div style={{marginLeft:8}}>
              <div style={{color:'#fbbf24', fontWeight:700, fontSize:'0.82rem'}}>Totals don't match the score</div>
              <div style={{color:'#888', fontSize:'0.75rem', marginTop:2}}>Check this box to save anyway (partial stats, missing players, etc.)</div>
            </div>
          </label>
        )}
      </div>

      {/* Duplicate warning */}
      {duplicateGame && (
        <div style={{...s.warnBanner, display:'flex', alignItems:'center', gap:6}}><IconWarn size={14} color="#facc15" /> Game {game.game_number} already exists in this series. Choose a different game number.</div>
      )}

      {/* Stat grids */}
      <PlayerGrid
        title={`${series?.our_team_name || 'Our Team'}`}
        side="our"
        players={game.our_players}
        allPlayers={allPlayers}
        teamColor="#9333ea"
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

      {duplicateWarning && (
        <div style={{background:'rgba(255,165,0,0.12)', border:'1px solid #f97316', borderRadius:8, padding:'0.75rem 1rem', marginBottom:'0.75rem'}}>
          <p style={{color:'#fb923c', fontSize:'0.85rem', margin:'0 0 0.5rem 0', fontWeight:700}}>⚠️ Possible Duplicate Detected</p>
          <p style={{color:'#fcd34d', fontSize:'0.8rem', margin:'0 0 0.75rem 0'}}>{duplicateWarning}</p>
          <div style={{display:'flex', gap:'0.5rem'}}>
            <button onClick={() => handleSave(true)} style={{background:'#f97316', color:'#fff', border:'none', borderRadius:6, padding:'0.4rem 0.8rem', fontSize:'0.8rem', cursor:'pointer', fontWeight:700}}>Submit Anyway</button>
            <button onClick={() => setDuplicateWarning(null)} style={{background:'none', color:'#fb923c', border:'1px solid #f97316', borderRadius:6, padding:'0.4rem 0.8rem', fontSize:'0.8rem', cursor:'pointer'}}>Cancel</button>
          </div>
        </div>
      )}

      {(() => {
        const blocked = saving || duplicateGame || (!totalsOk && !overrideTotal) || (contributorMode && !image)
        return (
          <div style={{display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap'}}>
            <button onClick={() => handleSave(false)} disabled={blocked} style={{...s.btnSave, opacity: blocked ? 0.4 : 1}}>
              {saving ? 'Saving...' : saveLabel}
            </button>
            {reviewMode && <RejectButton submissionId={submissionId} authHeaders={authHeaders} onDone={() => navigate('/review')} />}
          </div>
        )
      })()}
      {contributorMode && !image && (
        <p style={{color:'#888', fontSize:'0.78rem', marginTop:'0.5rem'}}>A screenshot is required to submit.</p>
      )}
      {!totalsOk && !overrideTotal && !duplicateGame && (
        <p style={{color:'#888', fontSize:'0.78rem', marginTop:'0.5rem'}}>
          ↑ Check the override box above to save with mismatched totals
        </p>
      )}
    </div>
  )
}

function ParseReport({ info, onSwap, ourName }) {
  const clean = !info.issues.length
  return (
    <div style={{...s.infoBanner, borderColor: clean ? '#14532d' : '#7c2d12', background: clean ? '#03140a' : '#1a0a02'}}>
      <div style={{display:'flex', alignItems:'center', gap:6, color: clean ? '#4ade80' : '#fb923c', fontWeight:700}}>
        {clean ? <IconCheck size={14} color="#4ade80" /> : <IconWarn size={14} color="#fb923c" />}
        {clean ? 'Every column matches the screenshot\'s TOTAL rows' : `${info.issues.length} cell${info.issues.length > 1 ? 's' : ''} didn't reconcile — check these against the screenshot`}
      </div>
      {!clean && <ul style={{margin:'0.4rem 0 0', paddingLeft:'1.2rem', color:'#fdba74'}}>{info.issues.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      {info.corrections.length > 0 && <div style={{marginTop:6}}>Matched to existing players: {info.corrections.map(c => `${c.from} → ${c.to}`).join(', ')}</div>}
      {info.new_players.length > 0 && <div style={{marginTop:6, color:'#facc15'}}>New players (check spelling — they'll be created): {info.new_players.join(', ')}</div>}
      {info.marked_matchup && <div style={{marginTop:6}}>Matchup from arrows: {info.marked_matchup.defender} guarded {info.marked_matchup.offensive}</div>}
      <div style={{marginTop:6, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
        <span>Team sides picked by {info.side_reason}{info.side_reason === 'guess' ? ' — make sure ' + (ourName || 'your team') + ' is on top below' : ''}.</span>
        <button type="button" onClick={onSwap} style={{background:'none', border:'1px solid #333', color:'#ccc', borderRadius:4, padding:'0.2rem 0.6rem', cursor:'pointer', fontSize:'0.78rem'}}>Swap teams</button>
      </div>
    </div>
  )
}

function RejectButton({ submissionId, authHeaders, onDone }) {
  const [busy, setBusy] = useState(false)
  async function reject() {
    const note = window.prompt('Reason for rejecting (shown to the submitter, optional):')
    if (note === null) return
    setBusy(true)
    const res = await fetch('/.netlify/functions/review-submission', {
      method: 'POST', headers: await authHeaders(),
      body: JSON.stringify({ action: 'reject', id: submissionId, note }),
    })
    setBusy(false)
    if (res.ok) onDone()
    else alert((await res.json()).error || 'Reject failed')
  }
  return (
    <button onClick={reject} disabled={busy} style={{...s.btnSave, background:'none', border:'1px solid #7f1d1d', color:'#f87171'}}>
      {busy ? 'Rejecting...' : 'Reject'}
    </button>
  )
}

function TotalCheck({ label, sum, score, ok }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:8}}>
      <span style={{color:'#666', fontSize:'0.8rem'}}>{label}:</span>
      <span style={{color:'#fff', fontSize:'0.9rem', fontWeight:600}}>Σ{sum} / {score || '?'}</span>
      {ok ? <IconCheck size={16} color="#4ade80" /> : <IconX size={16} color="#f87171" />}
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
  btnSave: { background:'#f4701b', color:'#fff', border:'none', borderRadius:4, padding:'0.85rem 2rem', fontSize:'1rem', fontWeight:700, cursor:'pointer', marginTop:'1rem' },
  error: { color:'#e55', fontSize:'0.85rem' },
  infoBanner: { background:'#0b0614', border:'1px solid #2a1a3e', borderRadius:6, padding:'0.7rem 1rem', color:'#aaa', fontSize:'0.83rem', marginBottom:'1.25rem', lineHeight:1.5 },
  preview: { maxWidth:'100%', maxHeight:420, borderRadius:6, border:'1px solid #1a1a1a', display:'block' },
  doneCard: { maxWidth:460, margin:'3rem auto', textAlign:'center', background:'#080808', border:'1px solid #1a1a1a', borderRadius:10, padding:'2rem 1.5rem' },
  doneLink: { color:'#ccc', border:'1px solid #2a2a2a', borderRadius:4, padding:'0.55rem 1rem', textDecoration:'none', fontSize:'0.85rem' },
  doneBtn: { background:'#f4701b', color:'#fff', border:'none', borderRadius:4, padding:'0.55rem 1rem', fontSize:'0.85rem', fontWeight:700, cursor:'pointer' },
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
