import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { colors, fonts } from '../lib/theme'

const OR = '#f4701b'
const BL = '#9333ea'
const BG = '#0a0a0f'
const SURF = '#0d0d14'
const BORDER = '#161616'

export default function Dashboard() {
  const { isEditor, session, loading: authLoading, signOut } = useAuth()
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(true)
  const [heroData, setHeroData] = useState({ games: [], stats: [] })

  useEffect(() => {
    // Wait for auth to resolve so we fetch with the correct session state (one fetch, no flash)
    if (authLoading) return
    async function fetchSeries() {
      const q = supabase.from('series').select('*').order('created_at', { ascending: false })
      // Only unauthenticated visitors are limited to published series
      // Signed-in friends can see all series BrandoBank has created
      if (!session) q.eq('published', true)
      const { data } = await q
      setSeries(data || [])
      setLoading(false)
    }
    fetchSeries()
    const channel = supabase
      .channel('dashboard-series')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'series' }, fetchSeries)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session, authLoading])

  // Load hero data for the first active series
  useEffect(() => {
    const hero = series.find(s => s.status === 'in_progress')
    if (!hero) return
    Promise.all([
      supabase.from('games').select('*').eq('series_id', hero.id).order('game_number'),
      supabase.from('series_player_stats')
        .select('gamertag,display_name,primary_side,ppg,rpg,apg,fg_pct,spg,bpg')
        .eq('series_id', hero.id)
        .order('ppg', { ascending: false })
        .limit(5),
    ]).then(([{ data: gms }, { data: sts }]) => {
      setHeroData({ games: gms || [], stats: sts || [] })
    })
  }, [series])

  const active = series.filter(s => s.status === 'in_progress')
  // Finished = complete or ended early (unfinished); both belong with past series
  const completed = series.filter(s => s.status === 'complete' || s.status === 'unfinished')

  return (
    <div style={p.page}>
      {/* Header */}
      <div style={p.header}>
        <div>
          <div style={p.pageTitle}>THE SERIES</div>
          <div style={p.pageSub}>All Series — Next Up Pro-Am</div>
        </div>
        <div style={p.actions}>
          {isEditor && <Link to="/series/new" style={p.btnNew}>+ NEW SERIES</Link>}
        </div>
      </div>

      {/* Page accent stripe */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, #f4701b, rgba(244,112,27,0.3) 50%, transparent)', width: '100%' }} />

      {loading ? (
        <p style={p.dim}>Loading...</p>
      ) : series.length === 0 ? (
        <div style={p.empty}>
          <p style={p.dim}>No series yet.</p>
          {isEditor && <Link to="/series/new" style={p.btnNew}>Start the First One</Link>}
        </div>
      ) : (
        <div>
          {/* Active series Jumbotron */}
          {active.length > 0 && (
            <SeriesHero series={active[0]} games={heroData.games} stats={heroData.stats} />
          )}

          {/* Additional active series (if more than one) */}
          {active.length > 1 && (
            <div style={{ padding: '0 20px' }}>
              <div style={p.sectionLabel}>
                <span style={p.liveDot} />
                ALSO IN PROGRESS
              </div>
              <div style={p.cardList}>
                {active.slice(1).map(s => <SeriesCard key={s.id} s={s} live />)}
              </div>
            </div>
          )}

          {/* Completed series */}
          {completed.length > 0 && (
            <div style={{ padding: '0 20px', marginTop: active.length > 0 ? 28 : 0 }}>
              <div style={p.sectionLabel}>COMPLETED</div>
              <div style={p.cardList}>
                {completed.map(s => <SeriesCard key={s.id} s={s} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}

// ─── Series Hero (Jumbotron for active series) ─────────────────────────────

function SeriesHero({ series: ser, games, stats }) {
  const winsA = ser.our_wins ?? 0
  const winsB = ser.opp_wins ?? 0
  const gamesPlayed = winsA + winsB
  const nextGame = gamesPlayed + 1
  const clinch = ser.format ? Math.ceil(ser.format / 2) : 2
  const pctBar = ser.format ? (Math.max(winsA, winsB) / clinch) * 100 : 0

  const ourStats = stats.filter(p => p.primary_side === 'our')
  const oppStats = stats.filter(p => p.primary_side === 'opp')

  return (
    <Link to={`/series/${ser.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div style={hero.outer}>
        {/* Corner brackets */}
        <div style={{ ...hero.corner, top: 0, left: 0, borderTop: `2px solid ${OR}`, borderLeft: `2px solid ${OR}` }} />
        <div style={{ ...hero.corner, top: 0, right: 0, borderTop: `2px solid ${OR}`, borderRight: `2px solid ${OR}` }} />
        <div style={{ ...hero.corner, bottom: 0, left: 0, borderBottom: `2px solid ${OR}`, borderLeft: `2px solid ${OR}` }} />
        <div style={{ ...hero.corner, bottom: 0, right: 0, borderBottom: `2px solid ${OR}`, borderRight: `2px solid ${OR}` }} />

        {/* Scanlines */}
        <div style={hero.scanlines} />

        {/* Header bar */}
        <div style={hero.headerBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={hero.pulse} />
            <span style={hero.liveTxt}>LIVE</span>
            <span style={hero.seriesName}>{ser.name.toUpperCase()}</span>
          </div>
          <span style={hero.formatTag}>BO{ser.format} · G{nextGame} NEXT</span>
        </div>

        {/* Main score block */}
        <div style={hero.scoreBlock}>
          <div style={hero.teamBlock}>
            <div style={hero.teamName}>{ser.our_team_name || 'US'}</div>
            <div style={{ ...hero.bigScore, color: winsA >= winsB ? OR : '#444' }}>{winsA}</div>
          </div>
          <div style={hero.separator}>
            <div style={hero.sepLine} />
            <span style={hero.sepDash}>–</span>
            <div style={hero.sepLine} />
          </div>
          <div style={{ ...hero.teamBlock, textAlign: 'right' }}>
            <div style={{ ...hero.teamName, color: '#a78bfa' }}>{ser.opp_team_name || 'THEM'}</div>
            <div style={{ ...hero.bigScore, color: winsB >= winsA ? BL : '#444' }}>{winsB}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={hero.barTrack}>
          <div style={{ ...hero.barFill, width: `${pctBar}%` }} />
        </div>
        <div style={hero.barLabel}>{gamesPlayed} game{gamesPlayed !== 1 ? 's' : ''} played · first to {clinch} wins</div>

        {/* Game results strip */}
        {games.length > 0 && (
          <div style={hero.gameStrip}>
            {games.map(g => (
              <div key={g.id} style={{ ...hero.gameChip, borderColor: g.our_result === 'W' ? `${OR}60` : '#dc262660' }}>
                <span style={hero.gameLabel}>G{g.game_number}</span>
                <span style={{ color: g.our_result === 'W' ? OR : '#ef4444', fontWeight: 800, fontSize: '0.7rem' }}>{g.our_result}</span>
                <span style={hero.gameScore}>{g.our_score}–{g.opp_score}</span>
              </div>
            ))}
          </div>
        )}

        {/* Top performers */}
        {stats.length > 0 && (
          <div style={hero.perfSection}>
            <div style={hero.perfLabel}>TOP PERFORMERS</div>
            <div style={hero.perfGrid}>
              {stats.slice(0, 5).map(pl => (
                <div key={pl.gamertag} style={hero.perfCard}>
                  <div style={{ ...hero.perfSide, color: pl.primary_side === 'our' ? OR : '#a78bfa' }}>
                    {pl.primary_side === 'our' ? (ser.our_team_name || 'US').slice(0, 6).toUpperCase() : (ser.opp_team_name || 'OPP').slice(0, 6).toUpperCase()}
                  </div>
                  <div style={hero.perfName}>{pl.display_name || pl.gamertag}</div>
                  <div style={hero.perfStats}>
                    <span style={{ color: OR }}>{pl.ppg}</span>
                    <span style={hero.perfDot}>/</span>
                    <span style={{ color: '#a78bfa' }}>{pl.rpg}</span>
                    <span style={hero.perfDot}>/</span>
                    <span style={{ color: '#60a5fa' }}>{pl.apg}</span>
                  </div>
                  <div style={hero.perfFg}>{pl.fg_pct}% FG</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={hero.cta}>
          VIEW SERIES <span style={{ marginLeft: 4 }}>→</span>
        </div>
      </div>
    </Link>
  )
}

function SeriesCard({ s, live }) {
  const teamA = s.our_team_name || 'US'
  const teamB = s.opp_team_name || 'THEM'
  const winsA = s.our_wins ?? 0
  const winsB = s.opp_wins ?? 0
  const total = winsA + winsB
  const pctA = total > 0 ? winsA / total : 0.5
  const dateStr = s.started_at
    ? new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <Link to={`/series/${s.id}`} style={c.card}>
      <div style={c.inner}>
        <div style={c.teams}>
          <span style={{ ...c.team, color: OR }}>{teamA}</span>
          <div style={c.vs}>
            {live ? (
              <span style={c.liveBadge}>LIVE</span>
            ) : (
              <span style={c.vsTxt}>VS</span>
            )}
          </div>
          <span style={{ ...c.team, color: BL, textAlign: 'right' }}>{teamB}</span>
        </div>
        <div style={c.scoreRow}>
          <span style={{ ...c.score, color: winsA >= winsB ? OR : '#555' }}>{winsA}</span>
          <span style={c.dash}>—</span>
          <span style={{ ...c.score, color: winsB >= winsA ? BL : '#555' }}>{winsB}</span>
        </div>
        <div style={c.barWrap}>
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: `${pctA * 100}%`, background: `linear-gradient(90deg, ${OR}cc, ${OR})`, borderRadius: '2px 0 0 2px', transition: 'width 0.4s' }} />
            <div style={{ flex: 1, background: `linear-gradient(90deg, ${BL}, ${BL}cc)`, borderRadius: '0 2px 2px 0' }} />
          </div>
        </div>
        <div style={c.meta}>
          <span style={c.seriesName}>{s.name}</span>
          {dateStr && <span style={c.date}>{dateStr}</span>}
        </div>
        {s.storyline && <p style={c.story}>{s.storyline}</p>}
      </div>
    </Link>
  )
}

const p = {
  page: {
    minHeight: '100vh',
    background: BG,
    color: '#fff',
    fontFamily: fonts.display,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 20px 16px',
    borderBottom: `1px solid ${BORDER}`,
  },
  pageTitle: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontSize: 26,
    fontWeight: 900,
    letterSpacing: '0.12em',
    color: '#fff',
    textTransform: 'uppercase',
  },
  pageSub: {
    fontSize: 11,
    color: '#333',
    marginTop: 2,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  btnNew: {
    background: OR,
    color: '#000',
    padding: '7px 14px',
    borderRadius: 6,
    textDecoration: 'none',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.08em',
    fontFamily: fonts.display,
  },
  dim: {
    color: '#333',
    textAlign: 'center',
    marginTop: '4rem',
    fontSize: 13,
    letterSpacing: '0.04em',
  },
  empty: {
    textAlign: 'center',
    padding: '5rem 0',
  },
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 3,
    color: '#333',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: OR,
    display: 'inline-block',
    boxShadow: `0 0 6px ${OR}`,
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    overflow: 'hidden',
  },
}

const hero = {
  outer: {
    position: 'relative',
    margin: '16px 16px 0',
    background: 'linear-gradient(160deg, #0d0d14 0%, #060610 60%, #0a0005 100%)',
    border: `1px solid #1e1e2e`,
    borderRadius: 12,
    overflow: 'hidden',
    padding: '0 0 4px',
  },
  corner: {
    position: 'absolute',
    width: 14,
    height: 14,
    zIndex: 2,
    pointerEvents: 'none',
  },
  scanlines: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  headerBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px 8px',
    borderBottom: '1px solid #111',
    background: 'rgba(0,0,0,0.3)',
    position: 'relative',
    zIndex: 2,
  },
  pulse: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#ef4444',
    display: 'inline-block',
    boxShadow: '0 0 8px #ef4444',
    flexShrink: 0,
  },
  liveTxt: {
    fontSize: '0.6rem',
    fontWeight: 900,
    color: '#ef4444',
    letterSpacing: '0.2em',
  },
  seriesName: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#666',
    letterSpacing: '0.1em',
  },
  formatTag: {
    fontSize: '0.6rem',
    color: '#444',
    fontWeight: 700,
    letterSpacing: '0.1em',
  },
  scoreBlock: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    padding: '20px 24px 10px',
    position: 'relative',
    zIndex: 2,
  },
  teamBlock: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  teamName: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontSize: '0.72rem',
    fontWeight: 800,
    color: OR,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  bigScore: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontSize: 64,
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: '-0.02em',
  },
  separator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    padding: '0 16px',
    flexShrink: 0,
  },
  sepLine: {
    width: 1,
    height: 20,
    background: '#1e1e2e',
  },
  sepDash: {
    color: '#2a2a3a',
    fontSize: 18,
    fontWeight: 300,
    lineHeight: 1.2,
  },
  barTrack: {
    height: 3,
    background: '#111',
    margin: '0 24px 6px',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
  },
  barFill: {
    height: '100%',
    background: `linear-gradient(90deg, ${OR}aa, ${OR})`,
    borderRadius: 2,
    transition: 'width 0.4s',
  },
  barLabel: {
    fontSize: '0.6rem',
    color: '#333',
    letterSpacing: '0.08em',
    textAlign: 'center',
    margin: '0 24px 12px',
    textTransform: 'uppercase',
    position: 'relative',
    zIndex: 2,
  },
  gameStrip: {
    display: 'flex',
    gap: 6,
    padding: '10px 16px',
    borderTop: '1px solid #0e0e1a',
    borderBottom: '1px solid #0e0e1a',
    overflowX: 'auto',
    position: 'relative',
    zIndex: 2,
  },
  gameChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    background: '#060610',
    border: '1px solid',
    borderRadius: 6,
    padding: '5px 10px',
    flexShrink: 0,
  },
  gameLabel: {
    fontSize: '0.6rem',
    color: '#444',
    fontWeight: 700,
    letterSpacing: '0.08em',
  },
  gameScore: {
    fontSize: '0.72rem',
    color: '#777',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  perfSection: {
    padding: '12px 16px 8px',
    position: 'relative',
    zIndex: 2,
  },
  perfLabel: {
    fontSize: '0.58rem',
    fontWeight: 800,
    letterSpacing: '0.16em',
    color: '#333',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  perfGrid: {
    display: 'flex',
    gap: 6,
    overflowX: 'auto',
  },
  perfCard: {
    background: '#060610',
    border: '1px solid #111',
    borderRadius: 8,
    padding: '8px 10px',
    minWidth: 90,
    flexShrink: 0,
  },
  perfSide: {
    fontSize: '0.52rem',
    fontWeight: 800,
    letterSpacing: '0.1em',
    marginBottom: 2,
  },
  perfName: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#ccc',
    marginBottom: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 80,
  },
  perfStats: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    fontSize: '0.72rem',
    fontWeight: 800,
    marginBottom: 2,
  },
  perfDot: {
    color: '#2a2a2a',
    fontSize: '0.6rem',
  },
  perfFg: {
    fontSize: '0.58rem',
    color: '#444',
    letterSpacing: '0.04em',
  },
  cta: {
    textAlign: 'center',
    padding: '8px 16px 12px',
    fontSize: '0.65rem',
    fontWeight: 800,
    color: OR,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    position: 'relative',
    zIndex: 2,
  },
}

const c = {
  card: {
    display: 'block',
    background: SURF,
    textDecoration: 'none',
    color: 'inherit',
    borderBottom: `1px solid ${BORDER}`,
    transition: 'background 0.15s',
  },
  inner: {
    padding: '16px 18px',
  },
  teams: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  team: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    flex: 1,
  },
  vs: {
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsTxt: {
    fontSize: 9,
    fontWeight: 800,
    color: '#333',
    letterSpacing: '0.1em',
  },
  liveBadge: {
    fontSize: 9,
    fontWeight: 800,
    color: OR,
    letterSpacing: '0.1em',
    background: `${OR}15`,
    border: `1px solid ${OR}40`,
    borderRadius: 4,
    padding: '2px 6px',
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  score: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontSize: 36,
    fontWeight: 900,
    letterSpacing: '-0.02em',
    lineHeight: 1,
  },
  dash: {
    fontSize: 18,
    color: '#2a2a2a',
    fontWeight: 300,
  },
  barWrap: {
    height: 3,
    background: 'transparent',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seriesName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#888',
    letterSpacing: '0.04em',
  },
  date: {
    fontSize: 10,
    color: '#333',
    letterSpacing: '0.04em',
  },
  story: {
    fontSize: 11,
    color: '#444',
    lineHeight: 1.5,
    marginTop: 6,
    marginBottom: 0,
    fontStyle: 'italic',
  },
}
