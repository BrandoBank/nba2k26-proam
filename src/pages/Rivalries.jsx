import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const ORANGE = '#f4701b'
const BLUE   = '#38bdf8'

const s = {
  page: { minHeight: '100vh', background: '#0a0a0f', color: '#fff', padding: '20px 16px 100px', maxWidth: 900, margin: '0 auto' },
  heading: { fontSize: 22, fontWeight: 700, letterSpacing: 1, marginBottom: 4 },
  sub: { fontSize: 13, color: '#666', marginBottom: 24 },
  selectorRow: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 },
  select: { flex: 1, minWidth: 160, background: '#111', border: '1px solid #222', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: 14, appearance: 'none', cursor: 'pointer' },
  vsLabel: { fontWeight: 700, color: '#444', fontSize: 18 },
  compareBtn: { background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  card: { background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20, marginBottom: 20 },
  cardTitle: { fontSize: 13, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
  statGrid: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px 0', alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#555', textAlign: 'center', padding: '0 12px' },
  winRecord: { textAlign: 'center', padding: '16px 0' },
  bigNum: { fontSize: 48, fontWeight: 800, lineHeight: 1 },
  winPct: { fontSize: 13, color: '#888', marginTop: 4 },
  recordRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 8 },
  divider: { width: 1, height: 40, background: '#222' },
  seriesRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #161616' },
  calloutSection: { marginTop: 28 },
  calloutTitle: { fontSize: 13, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  calloutBtns: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  callout1v1: { background: 'linear-gradient(135deg, #f4701b, #e05c0a)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 24px', fontWeight: 800, fontSize: 15, cursor: 'pointer', letterSpacing: 0.5 },
  calloutDraft: { background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 24px', fontWeight: 800, fontSize: 15, cursor: 'pointer', letterSpacing: 0.5 },
  toast: { position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, padding: '12px 20px', fontSize: 14, zIndex: 9999, whiteSpace: 'nowrap' },
  pendingCallouts: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20, marginBottom: 20 },
  calloutItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #161616' },
  acceptBtn: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginRight: 8 },
  declineBtn: { background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  badge: { background: ORANGE, color: '#fff', borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700, marginLeft: 8 },
  noData: { textAlign: 'center', color: '#333', padding: '40px 0', fontSize: 14 },
  winBar: { height: 6, borderRadius: 3, background: '#1a1a1a', overflow: 'hidden', marginTop: 8, position: 'relative' },
  winBarFill: (pct, col) => ({ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct * 100}%`, background: col, borderRadius: 3 }),
}

function StatRow({ label, aVal, bVal, higherIsBetter = true }) {
  const aNum = parseFloat(aVal) || 0
  const bNum = parseFloat(bVal) || 0
  const aWins = higherIsBetter ? aNum > bNum : aNum < bNum
  const bWins = higherIsBetter ? bNum > aNum : bNum < aNum
  return (
    <>
      <div style={{ ...s.statVal, color: aWins ? ORANGE : bWins ? '#888' : '#ccc', textAlign: 'right' }}>{aVal ?? '—'}</div>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statVal, color: bWins ? BLUE : aWins ? '#888' : '#ccc', textAlign: 'left' }}>{bVal ?? '—'}</div>
    </>
  )
}

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

  const showToast = msg => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Fetch playerRow whenever gamertag changes
  useEffect(() => {
    if (!gamertag) { setPlayerRow(null); return }
    supabase.from('players').select('id,gamertag,display_name').eq('gamertag', gamertag).maybeSingle()
      .then(({ data }) => setPlayerRow(data || null))
  }, [gamertag])

  // Load all players + career totals + pending callouts on mount
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

  // Pre-select logged-in player as A
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

    // Get all series where both players appeared
    const { data: spaA } = await supabase.from('series_player_averages').select('series_id,side,ppg,rpg,apg,gp').eq('player_id', pA.id)
    const { data: spaB } = await supabase.from('series_player_averages').select('series_id,side,ppg,rpg,apg,gp').eq('player_id', pB.id)

    const setA = new Set((spaA || []).map(r => r.series_id))
    const sharedSeriesIds = (spaB || []).filter(r => setA.has(r.series_id)).map(r => r.series_id)

    if (sharedSeriesIds.length === 0) { setH2hData({ seriesAWins: 0, seriesBWins: 0, history: [] }); setLoading(false); return }

    const { data: seriesList } = await supabase
      .from('series')
      .select('id,name,our_wins,opp_wins,ended_at')
      .in('id', sharedSeriesIds)
      .order('ended_at', { ascending: false })

    let seriesAWins = 0, seriesBWins = 0
    const history = (seriesList || []).map(ser => {
      const rowA = (spaA || []).find(r => r.series_id === ser.id)
      const rowB = (spaB || []).find(r => r.series_id === ser.id)
      const aWon = rowA?.side === 'our'
        ? (ser.our_wins || 0) > (ser.opp_wins || 0)
        : (ser.opp_wins || 0) > (ser.our_wins || 0)
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
    if (!target) return
    if (target.id === playerRow.id) { showToast("Can't call out yourself"); return }

    const { error } = await supabase.from('callouts').insert({
      challenger_id: playerRow.id,
      challenged_id: target.id,
      type,
      status: 'pending',
    })
    if (error) { showToast('Error sending callout'); return }
    showToast(`🔥 ${type.toUpperCase()} callout sent to ${target.display_name || target.gamertag}!`)
    setMyCallouts(prev => [...prev, { type, challenged: target, status: 'pending', created_at: new Date().toISOString() }])
  }

  const respondCallout = async (id, newStatus) => {
    const { error } = await supabase.from('callouts').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { showToast('Error responding'); return }
    setPendingCallouts(prev => prev.filter(c => c.id !== id))
    showToast(newStatus === 'accepted' ? '✅ Callout accepted — let\'s run it!' : 'Callout declined.')
  }

  const carA = careers[playerA]
  const carB = careers[playerB]
  const totalH2H = h2hData ? h2hData.seriesAWins + h2hData.seriesBWins : 0
  const pctA = totalH2H > 0 ? h2hData.seriesAWins / totalH2H : 0.5
  const canCallout = session && playerRow && playerB && playerRow.gamertag !== playerB

  return (
    <div style={s.page}>
      <div style={s.heading}>Rivalries</div>
      <div style={s.sub}>Compare players head-to-head • Call out your competition</div>

      {/* Pending callouts for logged-in player */}
      {pendingCallouts.length > 0 && (
        <div style={s.pendingCallouts}>
          <div style={{ ...s.cardTitle, color: ORANGE }}>
            ⚡ You've Been Called Out
            <span style={s.badge}>{pendingCallouts.length}</span>
          </div>
          {pendingCallouts.map(c => (
            <div key={c.id} style={s.calloutItem}>
              <div>
                <span style={{ fontWeight: 700 }}>{c.challenger?.display_name || c.challenger?.gamertag}</span>
                <span style={{ color: '#555', marginLeft: 8 }}>wants a</span>
                <span style={{ color: c.type === '1v1' ? ORANGE : BLUE, fontWeight: 700, marginLeft: 8 }}>
                  {c.type.toUpperCase()}
                </span>
              </div>
              <div>
                <button style={s.acceptBtn} onClick={() => respondCallout(c.id, 'accepted')}>Accept</button>
                <button style={s.declineBtn} onClick={() => respondCallout(c.id, 'declined')}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selector row */}
      <div style={s.selectorRow}>
        <select style={s.select} value={playerA} onChange={e => setPlayerA(e.target.value)}>
          <option value="">— Player A —</option>
          {players.map(p => <option key={p.id} value={p.gamertag}>{p.display_name || p.gamertag}</option>)}
        </select>
        <div style={s.vsLabel}>VS</div>
        <select style={s.select} value={playerB} onChange={e => setPlayerB(e.target.value)}>
          <option value="">— Player B —</option>
          {players.map(p => <option key={p.id} value={p.gamertag}>{p.display_name || p.gamertag}</option>)}
        </select>
        <button style={s.compareBtn} onClick={compare} disabled={!playerA || !playerB || playerA === playerB}>
          {loading ? '…' : 'Compare'}
        </button>
      </div>

      {/* Career stats comparison */}
      {playerA && playerB && playerA !== playerB && (
        <div style={s.card}>
          <div style={s.cardTitle}>Career Stats</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <Link to={`/player/${playerA}`} style={{ color: ORANGE, fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>
              {carA?.display_name || playerA}
            </Link>
            <Link to={`/player/${playerB}`} style={{ color: BLUE, fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>
              {carB?.display_name || playerB}
            </Link>
          </div>
          <div style={s.statGrid}>
            <StatRow label="PPG" aVal={carA?.career_ppg} bVal={carB?.career_ppg} />
            <StatRow label="RPG" aVal={carA?.career_rpg} bVal={carB?.career_rpg} />
            <StatRow label="APG" aVal={carA?.career_apg} bVal={carB?.career_apg} />
            <StatRow label="FG%" aVal={carA?.career_fg_pct} bVal={carB?.career_fg_pct} />
            <StatRow label="3P%" aVal={carA?.career_3p_pct} bVal={carB?.career_3p_pct} />
            <StatRow label="SPG" aVal={carA?.career_spg} bVal={carB?.career_spg} />
            <StatRow label="Games" aVal={carA?.total_gp} bVal={carB?.total_gp} />
            <StatRow label="ELITEs" aVal={carA?.elite_count} bVal={carB?.elite_count} />
            <StatRow label="MVPs" aVal={carA?.mvp_count} bVal={carB?.mvp_count} />
            <StatRow label="G TIERs" aVal={carA?.g_tier_count} bVal={carB?.g_tier_count} higherIsBetter={false} />
          </div>
        </div>
      )}

      {/* H2H record */}
      {h2hData && (
        <div style={s.card}>
          <div style={s.cardTitle}>Head-to-Head — {totalH2H} series together</div>
          {totalH2H === 0 ? (
            <div style={s.noData}>No series played together yet</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ ...s.bigNum, color: ORANGE }}>{h2hData.seriesAWins}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {Math.round(pctA * 100)}% win rate
                  </div>
                </div>
                <div style={{ textAlign: 'center', color: '#333', fontWeight: 700, fontSize: 18 }}>W–L</div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ ...s.bigNum, color: BLUE }}>{h2hData.seriesBWins}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {Math.round((1 - pctA) * 100)}% win rate
                  </div>
                </div>
              </div>
              <div style={s.winBar}>
                <div style={s.winBarFill(pctA, ORANGE)} />
              </div>

              {/* Series history */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, color: '#444', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Series History</div>
                {h2hData.history.map(({ ser, rowA, rowB, aWon }) => (
                  <div key={ser.id} style={s.seriesRow}>
                    <Link to={`/series/${ser.id}`} style={{ color: '#888', fontSize: 13, textDecoration: 'none', flex: 1 }}>{ser.name}</Link>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                      {rowA && <span style={{ color: aWon ? ORANGE : '#444', fontSize: 13 }}>{rowA.ppg}pts</span>}
                      <span style={{ fontSize: 11, color: aWon ? ORANGE : BLUE, fontWeight: 700 }}>{aWon ? `${playerA} W` : `${playerB} W`}</span>
                      {rowB && <span style={{ color: !aWon ? BLUE : '#444', fontSize: 13 }}>{rowB.ppg}pts</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Callout section */}
      {canCallout && (
        <div style={s.calloutSection}>
          <div style={s.calloutTitle}>Send a Callout to {careers[playerB]?.display_name || playerB}</div>
          <div style={s.calloutBtns}>
            <button style={s.callout1v1} onClick={() => sendCallout('1v1')}>
              🔥 Call Out 1v1
            </button>
            <button style={s.calloutDraft} onClick={() => sendCallout('draft')}>
              🏀 Call Out to Draft
            </button>
          </div>
        </div>
      )}

      {/* My sent callouts */}
      {myCallouts.length > 0 && (
        <div style={{ ...s.card, marginTop: 28 }}>
          <div style={s.cardTitle}>My Sent Callouts</div>
          {myCallouts.map((c, i) => (
            <div key={i} style={s.calloutItem}>
              <span style={{ color: '#888' }}>
                {c.challenged?.display_name || c.challenged?.gamertag || playerB}
              </span>
              <span>
                <span style={{ color: c.type === '1v1' ? ORANGE : BLUE, fontWeight: 700, marginRight: 12 }}>{c.type.toUpperCase()}</span>
                <span style={{ color: c.status === 'accepted' ? '#16a34a' : c.status === 'declined' ? '#ef4444' : '#555', fontSize: 13 }}>
                  {c.status}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  )
}
