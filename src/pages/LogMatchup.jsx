import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { colors } from '../lib/theme'
import { IconShield, IconArrow, IconPlus } from '../lib/icons'

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT']

export default function LogMatchup() {
  const { id: seriesId, gameId } = useParams()
  const [series, setSeries] = useState(null)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [gamePlayers, setGamePlayers] = useState([]) // players in this game
  const [existingMatchups, setExistingMatchups] = useState([])

  const [myGamertag, setMyGamertag] = useState('')
  const [myGtagConfirmed, setMyGtagConfirmed] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [mySide, setMySide] = useState(null)

  const [primaryMatchup, setPrimaryMatchup] = useState('')
  const [switches, setSwitches] = useState([]) // [{quarter, gamertag, note}]
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Gamertag autocomplete
  const [gtagQuery, setGtagQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => { fetchData() }, [gameId])

  async function fetchData() {
    const [{ data: ser }, { data: gm }, { data: allP }, { data: stats }, { data: matchups }] = await Promise.all([
      supabase.from('series').select('*').eq('id', seriesId).single(),
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('players').select('*').order('gamertag'),
      supabase.from('game_stats').select('*, players(gamertag, display_name)').eq('game_id', gameId),
      supabase.from('game_matchups').select('*, players!game_matchups_defender_player_id_fkey(gamertag), opp:players!game_matchups_offensive_player_id_fkey(gamertag)').eq('game_id', gameId),
    ])
    setSeries(ser)
    setGame(gm)
    setPlayers(allP || [])
    setGamePlayers(stats || [])
    setExistingMatchups(matchups || [])
  }

  function confirmGamertag() {
    const found = players.find(p => p.gamertag.toLowerCase() === myGamertag.toLowerCase())
    if (!found) { setError('Gamertag not found in the player pool. Check spelling or ask an editor to add you.'); return }
    const statRow = gamePlayers.find(gs => gs.player_id === found.id)
    if (!statRow) { setError(`${found.gamertag} didn't play in this game according to the box score.`); return }
    setMyPlayerId(found.id)
    setMySide(statRow.side)
    setMyGtagConfirmed(true)
    setError('')

    // Pre-fill if they already have a matchup
    const existing = existingMatchups.find(m => m.defender_player_id === found.id)
    if (existing) {
      const oppP = players.find(p => p.id === existing.offensive_player_id)
      if (oppP) setPrimaryMatchup(oppP.gamertag)
      if (existing.quarter_switches) setSwitches(existing.quarter_switches)
      setSaved(false)
    }
  }

  // Players on the opposite side — default matchup options
  const oppPlayers = gamePlayers
    .filter(gs => gs.side !== mySide)
    .map(gs => gs.players)
    .filter(Boolean)

  function addSwitch() {
    setSwitches(s => [...s, { quarter: 'Q2', gamertag: '', note: '' }])
  }

  function updateSwitch(idx, field, val) {
    setSwitches(s => s.map((sw, i) => i === idx ? { ...sw, [field]: val } : sw))
  }

  function removeSwitch(idx) {
    setSwitches(s => s.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!primaryMatchup.trim()) { setError('Select who you guarded to start.'); return }
    setSaving(true)
    setError('')

    const offPlayer = players.find(p => p.gamertag.toLowerCase() === primaryMatchup.toLowerCase())
    if (!offPlayer) { setError('Primary matchup gamertag not found.'); setSaving(false); return }

    const validSwitches = switches.filter(sw => sw.gamertag.trim())
    // Resolve switch gamertags to confirm they exist
    const switchData = validSwitches.map(sw => ({
      quarter: sw.quarter,
      switched_to_gamertag: sw.gamertag.trim(),
      note: sw.note.trim() || null,
    }))

    // Upsert matchup
    const { error: err } = await supabase.from('game_matchups').upsert({
      game_id: gameId,
      defender_player_id: myPlayerId,
      offensive_player_id: offPlayer.id,
      quarter_switches: switchData,
      submitted_by_gamertag: myGamertag,
    }, { onConflict: 'game_id,defender_player_id' })

    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    fetchData()
  }

  const gtFiltered = gtagQuery.length >= 1
    ? players.filter(p => p.gamertag.toLowerCase().includes(gtagQuery.toLowerCase())).slice(0, 6)
    : []

  if (!game || !series) return <div style={s.page}><p style={s.dim}>Loading...</p></div>

  return (
    <div style={s.page}>
      <Link to={`/series/${seriesId}`} style={s.back}>← Back to Series</Link>

      <div style={s.header}>
        <div style={s.eyebrow}>
          <IconShield size={14} color={colors.orange} />
          <span>LOG YOUR MATCHUP</span>
        </div>
        <h1 style={s.title}>{series.name} · Game {game.game_number}</h1>
        <div style={s.gameMeta}>
          {series.our_team_name} {game.our_score} — {game.opp_score} {series.opp_team_name}
          <span style={{ color: game.our_result === 'W' ? colors.statGreen : colors.statRed, marginLeft: 8, fontWeight: 700 }}>
            {game.our_result === 'W' ? 'W' : 'L'}
          </span>
        </div>
      </div>

      {/* Existing matchups */}
      {existingMatchups.length > 0 && (
        <div style={s.existingWrap}>
          <div style={s.existingLabel}>Matchups logged so far</div>
          <div style={s.existingList}>
            {existingMatchups.map(m => (
              <div key={m.id} style={s.existingRow}>
                <span style={s.existingDef}>{m.players?.gamertag}</span>
                <span style={s.existingArrow}>guarded</span>
                <span style={s.existingOff}>{m.opp?.gamertag}</span>
                {m.quarter_switches?.length > 0 && (
                  <span style={s.existingSwitch}>
                    + {m.quarter_switches.length} switch{m.quarter_switches.length > 1 ? 'es' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Identify yourself */}
      {!myGtagConfirmed ? (
        <div style={s.card}>
          <div style={s.cardTitle}>Who are you?</div>
          <p style={s.cardSub}>Enter your gamertag to log your defensive matchup for this game.</p>
          <div style={s.gtagRow}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                style={s.input}
                value={gtagQuery || myGamertag}
                placeholder="Your gamertag..."
                onChange={e => {
                  const v = e.target.value
                  setMyGamertag(v)
                  setGtagQuery(v)
                  setShowDropdown(true)
                }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                autoComplete="off"
                spellCheck={false}
              />
              {showDropdown && gtFiltered.length > 0 && (
                <div style={s.dropdown}>
                  {gtFiltered.map(p => (
                    <div key={p.id} style={s.dropItem} onMouseDown={() => {
                      setMyGamertag(p.gamertag)
                      setGtagQuery(p.gamertag)
                      setShowDropdown(false)
                    }}>
                      {p.gamertag}
                      {p.display_name && <span style={{ color: '#555', marginLeft: 6 }}>({p.display_name})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button style={s.btnOrange} onClick={confirmGamertag}>Confirm</button>
          </div>
          {error && <p style={s.error}>{error}</p>}
        </div>
      ) : (
        <>
          {/* Step 2: Log matchup */}
          <div style={s.card}>
            <div style={s.cardTitle}>
              {myGamertag} <span style={{ color: '#555', fontWeight: 400 }}>·</span>
              <span style={{ color: mySide === 'our' ? colors.teamOur : colors.teamOpp, marginLeft: 6 }}>
                {mySide === 'our' ? series.our_team_name : series.opp_team_name}
              </span>
            </div>
            <p style={s.cardSub}>Who did you guard to start the game?</p>

            <div style={s.matchupGrid}>
              {oppPlayers.map(p => (
                <button
                  key={p.gamertag}
                  style={{
                    ...s.playerBtn,
                    borderColor: primaryMatchup === p.gamertag ? colors.orange : '#1e1e1e',
                    background: primaryMatchup === p.gamertag ? 'rgba(244,112,27,0.08)' : '#0a0a0a',
                    color: primaryMatchup === p.gamertag ? colors.orange : '#aaa',
                  }}
                  onClick={() => setPrimaryMatchup(p.gamertag)}
                >
                  {p.gamertag}
                </button>
              ))}
            </div>

            {/* Quarter switches */}
            <div style={s.switchSection}>
              <div style={s.switchLabel}>Did you switch at any point?</div>
              {switches.map((sw, i) => (
                <div key={i} style={s.switchRow}>
                  <select
                    style={s.selectSm}
                    value={sw.quarter}
                    onChange={e => updateSwitch(i, 'quarter', e.target.value)}
                  >
                    {QUARTERS.map(q => <option key={q}>{q}</option>)}
                  </select>
                  <span style={{ color: '#444', fontSize: '0.8rem' }}>switched to</span>
                  <select
                    style={{ ...s.selectSm, flex: 1 }}
                    value={sw.gamertag}
                    onChange={e => updateSwitch(i, 'gamertag', e.target.value)}
                  >
                    <option value="">Pick player...</option>
                    {oppPlayers.map(p => <option key={p.gamertag} value={p.gamertag}>{p.gamertag}</option>)}
                  </select>
                  <input
                    style={{ ...s.input, flex: 1, fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                    placeholder="Note (optional)..."
                    value={sw.note}
                    onChange={e => updateSwitch(i, 'note', e.target.value)}
                  />
                  <button style={s.removeBtn} onClick={() => removeSwitch(i)}>×</button>
                </div>
              ))}
              <button style={s.addSwitchBtn} onClick={addSwitch}>
                <IconPlus size={13} color={colors.orange} /> Add switch
              </button>
            </div>

            {error && <p style={s.error}>{error}</p>}

            {saved ? (
              <div style={s.successBanner}>
                Matchup saved. Rankings will update automatically.
                <Link to={`/series/${seriesId}`} style={{ color: colors.orange, marginLeft: 12, textDecoration: 'none', fontWeight: 600 }}>
                  Back to series <IconArrow size={12} color={colors.orange} />
                </Link>
              </div>
            ) : (
              <button style={s.btnOrange} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Matchup'}
              </button>
            )}
          </div>

          <button style={s.switchUser} onClick={() => { setMyGtagConfirmed(false); setMyGamertag(''); setGtagQuery('') }}>
            Not {myGamertag}? Switch
          </button>
        </>
      )}

      <div style={s.defaultNote}>
        Players who don't log a matchup default to guarding the opponent in their same position slot (PG on PG, SG on SG, etc.)
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', padding: '2rem', maxWidth: 700, margin: '0 auto', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  back: { color: '#444', textDecoration: 'none', fontSize: '0.8rem', display: 'block', marginBottom: '1.5rem' },
  header: { marginBottom: '2rem' },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 6, color: colors.orange, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.4rem', fontSize: '1.3rem', fontWeight: 800 },
  gameMeta: { color: '#555', fontSize: '0.85rem' },
  existingWrap: { background: '#080808', border: '1px solid #1a1a1a', borderRadius: 8, padding: '1rem 1.25rem', marginBottom: '1.5rem' },
  existingLabel: { color: '#444', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' },
  existingList: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  existingRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', flexWrap: 'wrap' },
  existingDef: { color: '#fff', fontWeight: 700 },
  existingArrow: { color: '#333', fontSize: '0.75rem' },
  existingOff: { color: colors.orange, fontWeight: 600 },
  existingSwitch: { color: '#555', fontSize: '0.75rem' },
  card: { background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 10, padding: '1.5rem', marginBottom: '1rem' },
  cardTitle: { fontWeight: 800, fontSize: '1rem', color: '#fff', marginBottom: '0.4rem' },
  cardSub: { color: '#555', fontSize: '0.85rem', margin: '0 0 1.25rem' },
  gtagRow: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  input: { background: '#000', border: '1px solid #222', borderRadius: 6, color: '#fff', padding: '0.6rem 0.8rem', fontSize: '0.9rem', outline: 'none', width: '100%' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #222', borderRadius: 6, zIndex: 50, overflow: 'hidden' },
  dropItem: { padding: '0.5rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem', color: '#ccc', borderBottom: '1px solid #1a1a1a' },
  matchupGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' },
  playerBtn: { border: '1px solid', borderRadius: 6, padding: '0.5rem 0.9rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s' },
  switchSection: { borderTop: '1px solid #111', paddingTop: '1.25rem', marginTop: '0.25rem' },
  switchLabel: { color: '#444', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' },
  switchRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' },
  selectSm: { background: '#000', border: '1px solid #222', borderRadius: 5, color: '#fff', padding: '0.35rem 0.5rem', fontSize: '0.82rem', outline: 'none' },
  addSwitchBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px dashed #2a2a2a', borderRadius: 6, color: colors.orange, fontSize: '0.82rem', fontWeight: 600, padding: '0.4rem 0.8rem', cursor: 'pointer', marginTop: '0.75rem' },
  removeBtn: { background: 'transparent', border: 'none', color: '#444', fontSize: '1.1rem', cursor: 'pointer', padding: '0.2rem 0.4rem' },
  btnOrange: { background: colors.orange, color: '#fff', border: 'none', borderRadius: 7, padding: '0.7rem 1.5rem', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', marginTop: '1rem' },
  successBanner: { background: 'rgba(22,163,74,0.08)', border: '1px solid #1a4a1a', borderRadius: 6, padding: '0.75rem 1rem', color: '#4caf50', fontSize: '0.88rem', marginTop: '1rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap' },
  switchUser: { background: 'transparent', border: 'none', color: '#333', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginTop: '0.5rem' },
  defaultNote: { color: '#2a2a2a', fontSize: '0.78rem', marginTop: '2rem', lineHeight: 1.6, borderTop: '1px solid #0f0f0f', paddingTop: '1rem' },
  error: { color: '#e55', fontSize: '0.82rem', marginTop: '0.5rem' },
  dim: { color: '#444' },
}
