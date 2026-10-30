import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const ORANGE = '#f4701b'
const BLUE   = '#38bdf8'

export default function Rivalries() {
  const { session, gamertag } = useAuth()
  const [playerRow, setPlayerRow] = useState(null)
  const [players, setPlayers] = useState([])
  const [playerA, setPlayerA] = useState('')
  const [playerB, setPlayerB] = useState('')
  const [careers, setCareers] = useState({})
  const [h2hData, setH2hData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [pendingCallouts, setPendingCallouts] = useState([])
  const [myCallouts, setMyCallouts] = useState([])

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    if (!gamertag) { setPlayerRow(null); return }
    supabase.from('players').select('id,gamertag,display_name').eq('gamertag', gamertag).maybeSingle()
      .then(({ data }) => setPlayerRow(data || null))
  }, [gamertag])

  useEffect(() => {
    async function load() {
      const [{ data: ps }, { data: careerRows }, { data: callouts }] = await Promise.all([
        supabase.from('players').select('id,gamertag,display_name').order('gamertag'),
        supabase.from('career_player_totals').select('*'),
        supabase.from('callouts').select('*, challenger:challenger_id(gamertag,display_name), challenged:challenged_id(gamertag,display_name)').in('status', ['pending']),
      ])
      setPlayers(ps || [])
      const map = {}
      ;(careerRows || []).forEach(r => { map[r.gamertag] = r })
      setCareers(map)
      if (gamertag) {
        setPendingCallouts((callouts || []).filter(c => c.challenged?.gamertag === gamertag))
        setMyCallouts((callouts || []).filter(c => c.challenger?.gamertag === gamertag))
      }
    }
    load()
  }, [gamertag])

  useEffect(() => {
    if (gamertag && !playerA) setPlayerA(gamertag)
  }, [gamertag, playerA])

  const compare = useCallback(async () => {
    if (!playerA || !playerB || playerA === playerB) return
    setLoading(true)
    setH2hData(null)
    const pA = players.find(p => p.gamertag === playerA)
    const pB = players.find(p => p.gamertag === playerB)
    if (!pA || !pB) { setLoading(false); return }

    const { data: spaA } = await supabase.from('series_player_averages').select('series_id,side,ppg,rpg,apg,gp').eq('player_id', pA.id)
    const { data: spaB } = await supabase.from('series_player_averages').select('series_id,side,ppg,rpg,apg,gp').eq('player_id', pB.id)
    const setA = new Set((spaA || []).map(r => r.series_id))
    const sharedSeriesIds = (spaB || []).filter(r => setA.has(r.series_id)).map(r => r.series_id)

    if (sharedSeriesIds.length === 0) { setH2hData({ seriesAWins: 0, seriesBWins: 0, history: [] }); setLoading(false); return }

    const { data: seriesList } = await supabase.from('series').select('id,name,our_wins,opp_wins,ended_at').in('id', sharedSeriesIds).order('ended_at', { ascending: false })
    let seriesAWins = 0, seriesBWins = 0
    const history = (seriesList || []).map(ser => {
      const rowA = (spaA || []).find(r => r.series_id === ser.id)
      const rowB = (spaB || []).find(r => r.series_id === ser.id)
      const aWon = rowA?.side === 'our' ? (ser.our_wins || 0) > (ser.opp_wins || 0) : (ser.opp_wins || 0) > (ser.our_wins || 0)
      if (aWon) seriesAWins++; else seriesBWins++
      return { ser, rowA, rowB, aWon }
    })
    setH2hData({ seriesAWins, seriesBWins, history })
    setLoading(false)
  }, [playerA, playerB, players])

  const sendCallout = async (type) => {
    if (!session) { showToast('Sign in to send a callout'); return }
    if (!playerRow) { showToast('Claim your gamertag first'); return }
    if (!playerB) { showToast('Pick an opponent first'); return }
    const target = players.find(p => p.gamertag === playerB)
    if (!target || target.id === playerRow.id) return
    const { error } = await supabase.from('callouts').insert({ challenger_id: playerRow.id, challenged_id: target.id, type, status: 'pending' })
    if (error) { showToast('Error sending callout'); return }
    showToast(`${type.toUpperCase()} callout sent to ${target.display_name || target.gamertag}`)
    setMyCallouts(prev => [...prev, { type, challenged: target, status: 'pending', created_at: new Date().toISOString() }])
  }

  const respondCallout = async (id, newStatus) => {
    const { error } = await supabase.from('callouts').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Error responding'); return }
    setPendingCallouts(prev => prev.filter(c => c.id !== id))
    showToast(newStatus === 'accepted' ? 'Callout accepted — let\'s run it' : 'Callout declined')
  }

  const carA = careers[playerA]
  const carB = careers[playerB]
  const totalH2H = h2hData ? h2hData.seriesAWins + h2hData.seriesBWins : 0
  const pctA = totalH2H > 0 ? h2hData.seriesAWins / totalH2H : 0.5
  const canCallout = session && playerRow && playerB && playerRow.gamertag !== playerB
  const nameA = carA?.display_name || playerA || 'Player A'
  const nameB = carB?.display_name || playerB || 'Player B'

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 100 }}>
      <style>{`
        .rival-select { appearance: none; background: transparent; border: none; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; outline: none; width: 100%; text-align: center; }
        .rival-select option { background: #111; color: #fff; }
        .stat-row-wrap:nth-child(odd) { background: rgba(255,255,255,0.02); }
        .callout-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .callout-btn { transition: opacity 0.15s, transform 0.15s; }
        .series-row:hover { background: rgba(255,255,255,0.03); }
      `}</style>

      {/* Pending callout alert */}
      {pendingCallouts.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, rgba(244,112,27,0.12), rgba(244,112,27,0.04))', borderBottom: `1px solid rgba(244,112,27,0.2)`, padding: '16px 20px' }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={ORANGE}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: ORANGE, textTransform: 'uppercase' }}>You've Been Called Out</span>
              <span style={{ background: ORANGE, color: '#000', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 900 }}>{pendingCallouts.length}</span>
            </div>
            {pendingCallouts.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>
                  <span style={{ fontWeight: 700, color: '#fff' }}>{c.challenger?.display_name || c.challenger?.gamertag}</span>
                  <span style={{ color: '#555', margin: '0 8px' }}>wants a</span>
                  <span style={{ fontWeight: 800, color: c.type === '1v1' ? ORANGE : BLUE, letterSpacing: 1 }}>{c.type.toUpperCase()}</span>
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => respondCallout(c.id, 'accepted')} style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Accept</button>
                  <button onClick={() => respondCallout(c.id, 'declined')} style={{ background: 'rgba(255,255,255,0.06)', color: '#888', border: '1px solid #222', borderRadius: 6, padding: '7px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matchup header */}
      <div style={{ background: 'linear-gradient(180deg, #0f0f18 0%, #0a0a0f 100%)', borderBottom: '1px solid #111', padding: '28px 20px 0' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#333', textTransform: 'uppercase', textAlign: 'center', marginBottom: 20 }}>Head-to-Head Matchup</div>

          {/* Player selector row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center', gap: 0 }}>
            {/* Player A */}
            <div style={{ background: `linear-gradient(135deg, rgba(244,112,27,0.08) 0%, transparent 70%)`, border: '1px solid rgba(244,112,27,0.15)', borderRight: 'none', borderRadius: '10px 0 0 0', padding: '16px 20px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: ORANGE, textTransform: 'uppercase', marginBottom: 8 }}>Player A</div>
              <select className="rival-select" value={playerA} onChange={e => setPlayerA(e.target.value)} style={{ color: playerA ? '#fff' : '#444', fontSize: 18, textAlign: 'left' }}>
                <option value="">Select player</option>
                {players.map(p => <option key={p.id} value={p.gamertag}>{p.display_name || p.gamertag}</option>)}
              </select>
              {carA && <div style={{ fontSize: 11, color: '#444', marginTop: 6 }}>{carA.total_gp} GP · {carA.career_ppg} PPG</div>}
            </div>

            {/* VS center */}
            <div style={{ background: '#0d0d14', border: '1px solid #111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0', gap: 10, position: 'relative' }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2, color: '#222' }}>VS</div>
              <button
                onClick={compare}
                disabled={!playerA || !playerB || playerA === playerB || loading}
                style={{ background: !playerA || !playerB || playerA === playerB ? '#111' : ORANGE, color: !playerA || !playerB || playerA === playerB ? '#333' : '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', transition: 'background 0.2s' }}
              >
                {loading ? '…' : 'Go'}
              </button>
            </div>

            {/* Player B */}
            <div style={{ background: `linear-gradient(225deg, rgba(56,189,248,0.08) 0%, transparent 70%)`, border: '1px solid rgba(56,189,248,0.15)', borderLeft: 'none', borderRadius: '0 10px 0 0', padding: '16px 20px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: BLUE, textTransform: 'uppercase', marginBottom: 8, textAlign: 'right' }}>Player B</div>
              <select className="rival-select" value={playerB} onChange={e => setPlayerB(e.target.value)} style={{ color: playerB ? '#fff' : '#444', fontSize: 18, textAlign: 'right' }}>
                <option value="">Select player</option>
                {players.map(p => <option key={p.id} value={p.gamertag}>{p.display_name || p.gamertag}</option>)}
              </select>
              {carB && <div style={{ fontSize: 11, color: '#444', marginTop: 6, textAlign: 'right' }}>{carB.total_gp} GP · {carB.career_ppg} PPG</div>}
            </div>
          </div>

          {/* Divider bar under selectors */}
          <div style={{ height: 3, background: `linear-gradient(90deg, ${ORANGE} 0%, #1a1a2e 50%, ${BLUE} 100%)`, marginTop: -1 }} />
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 20px' }}>

        {/* Career stats */}
        {playerA && playerB && playerA !== playerB && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#333', textTransform: 'uppercase', textAlign: 'center', marginBottom: 16 }}>Career Stats</div>
            <div style={{ border: '1px solid #161616', borderRadius: 10, overflow: 'hidden' }}>
              {/* Name header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', background: '#0d0d14' }}>
                <Link to={`/player/${playerA}`} style={{ color: ORANGE, fontWeight: 800, fontSize: 15, textDecoration: 'none', padding: '12px 16px', letterSpacing: 0.5 }}>{nameA}</Link>
                <div style={{ padding: '12px 0', color: '#222', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center' }}>STAT</div>
                <Link to={`/player/${playerB}`} style={{ color: BLUE, fontWeight: 800, fontSize: 15, textDecoration: 'none', padding: '12px 16px', letterSpacing: 0.5, textAlign: 'right' }}>{nameB}</Link>
              </div>
              {[
                { label: 'PPG', a: carA?.career_ppg, b: carB?.career_ppg },
                { label: 'RPG', a: carA?.career_rpg, b: carB?.career_rpg },
                { label: 'APG', a: carA?.career_apg, b: carB?.career_apg },
                { label: 'FG%', a: carA?.career_fg_pct, b: carB?.career_fg_pct },
                { label: '3P%', a: carA?.career_3p_pct, b: carB?.career_3p_pct },
                { label: 'SPG', a: carA?.career_spg, b: carB?.career_spg },
                { label: 'Games', a: carA?.total_gp, b: carB?.total_gp },
                { label: 'ELITEs', a: carA?.elite_count, b: carB?.elite_count },
                { label: 'MVPs', a: carA?.mvp_count, b: carB?.mvp_count },
                { label: 'G TIERs', a: carA?.g_tier_count, b: carB?.g_tier_count, lowerBetter: true },
              ].map(({ label, a, b, lowerBetter }) => {
                const an = parseFloat(a) || 0
                const bn = parseFloat(b) || 0
                const aWins = lowerBetter ? an < bn : an > bn
                const bWins = lowerBetter ? bn < an : bn > an
                const winPct = (an + bn) > 0 ? an / (an + bn) : 0.5
                return (
                  <div key={label} className="stat-row-wrap" style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center' }}>
                    <div style={{ padding: '10px 16px', textAlign: 'right', fontSize: 17, fontWeight: 800, color: aWins ? ORANGE : bWins ? '#555' : '#888' }}>{a ?? '—'}</div>
                    <div style={{ textAlign: 'center', position: 'relative' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#333', textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ height: 2, background: '#0d0d14', margin: '4px 0 0', borderRadius: 1, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(lowerBetter ? 1 - winPct : winPct) * 100}%`, background: aWins ? ORANGE : bWins ? BLUE : '#333', borderRadius: 1 }} />
                      </div>
                    </div>
                    <div style={{ padding: '10px 16px', textAlign: 'left', fontSize: 17, fontWeight: 800, color: bWins ? BLUE : aWins ? '#555' : '#888' }}>{b ?? '—'}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* H2H */}
        {h2hData && (
          <div style={{ marginTop: 28 }}>
            {totalH2H === 0 ? (
              <div style={{ textAlign: 'center', color: '#333', padding: '32px 0', fontSize: 14 }}>No series played together yet</div>
            ) : (
              <>
                {/* H2H record banner */}
                <div style={{ border: '1px solid #161616', borderRadius: 10, overflow: 'hidden', marginBottom: 2 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
                    <div style={{ padding: '24px 20px', background: pctA > 0.5 ? 'rgba(244,112,27,0.06)' : 'transparent', textAlign: 'center' }}>
                      <div style={{ fontSize: 52, fontWeight: 900, color: ORANGE, lineHeight: 1 }}>{h2hData.seriesAWins}</div>
                      <div style={{ fontSize: 11, color: '#444', marginTop: 6, letterSpacing: 1 }}>{Math.round(pctA * 100)}% WIN RATE</div>
                      <div style={{ fontSize: 12, color: pctA > 0.5 ? ORANGE : '#333', fontWeight: 700, marginTop: 4 }}>{nameA}</div>
                    </div>
                    <div style={{ background: '#161616' }} />
                    <div style={{ padding: '24px 20px', background: pctA < 0.5 ? 'rgba(56,189,248,0.06)' : 'transparent', textAlign: 'center' }}>
                      <div style={{ fontSize: 52, fontWeight: 900, color: BLUE, lineHeight: 1 }}>{h2hData.seriesBWins}</div>
                      <div style={{ fontSize: 11, color: '#444', marginTop: 6, letterSpacing: 1 }}>{Math.round((1 - pctA) * 100)}% WIN RATE</div>
                      <div style={{ fontSize: 12, color: pctA < 0.5 ? BLUE : '#333', fontWeight: 700, marginTop: 4 }}>{nameB}</div>
                    </div>
                  </div>
                  {/* Split bar */}
                  <div style={{ height: 4, display: 'flex' }}>
                    <div style={{ width: `${pctA * 100}%`, background: ORANGE, transition: 'width 0.6s ease' }} />
                    <div style={{ flex: 1, background: BLUE }} />
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 0', background: '#0a0a0f', fontSize: 10, color: '#333', letterSpacing: 2, textTransform: 'uppercase' }}>
                    {totalH2H} Series Together
                  </div>
                </div>

                {/* Series history */}
                <div style={{ border: '1px solid #161616', borderRadius: 10, overflow: 'hidden', marginTop: 16 }}>
                  <div style={{ padding: '10px 16px', background: '#0d0d14', fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333', textTransform: 'uppercase' }}>Series History</div>
                  {h2hData.history.map(({ ser, rowA, rowB, aWon }, i) => (
                    <div key={ser.id} className="series-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '11px 16px', borderTop: i > 0 ? '1px solid #0f0f0f' : 'none' }}>
                      <Link to={`/series/${ser.id}`} style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}>{ser.name}</Link>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: aWon ? ORANGE : '#2a2a2a', fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{rowA?.ppg ?? '—'}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: aWon ? ORANGE : BLUE, minWidth: 60, textAlign: 'center' }}>{aWon ? nameA : nameB} W</span>
                        <span style={{ color: !aWon ? BLUE : '#2a2a2a', fontSize: 12, fontWeight: 700, minWidth: 36 }}>{rowB?.ppg ?? '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Callout CTA */}
        {canCallout && (
          <div style={{ marginTop: 32, border: '1px solid #161616', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#0d0d14', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/>
                <line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/>
                <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/>
              </svg>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333', textTransform: 'uppercase' }}>Issue a Callout to {nameB}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
              <button className="callout-btn" onClick={() => sendCallout('1v1')} style={{ background: 'transparent', border: 'none', padding: '20px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(244,112,27,0.1)', border: '1px solid rgba(244,112,27,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/>
                    <line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/>
                    <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="21" x2="9" y2="19"/>
                  </svg>
                </div>
                <div style={{ color: ORANGE, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>1v1</div>
                <div style={{ color: '#444', fontSize: 11 }}>Run it straight up</div>
              </button>
              <div style={{ background: '#161616' }} />
              <button className="callout-btn" onClick={() => sendCallout('draft')} style={{ background: 'transparent', border: 'none', padding: '20px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9"/><path d="M12 3c0 4.97 3 9 7 10.5M12 3c0 4.97-3 9-7 10.5"/>
                    <path d="M5.5 19.5C7 16 9 13 12 12s5-4 6.5-7.5"/>
                  </svg>
                </div>
                <div style={{ color: BLUE, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>Draft</div>
                <div style={{ color: '#444', fontSize: 11 }}>Build your squads</div>
              </button>
            </div>
          </div>
        )}

        {/* My sent callouts */}
        {myCallouts.length > 0 && (
          <div style={{ marginTop: 24, border: '1px solid #161616', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#0d0d14', fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333', textTransform: 'uppercase' }}>Sent Callouts</div>
            {myCallouts.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: i > 0 ? '1px solid #0f0f0f' : 'none' }}>
                <span style={{ color: '#666', fontSize: 13 }}>{c.challenged?.display_name || c.challenged?.gamertag || playerB}</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ color: c.type === '1v1' ? ORANGE : BLUE, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>{c.type.toUpperCase()}</span>
                  <span style={{ color: c.status === 'accepted' ? '#16a34a' : c.status === 'declined' ? '#ef4444' : '#333', fontSize: 11 }}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '11px 18px', fontSize: 13, zIndex: 9999, whiteSpace: 'nowrap', color: '#ccc' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
