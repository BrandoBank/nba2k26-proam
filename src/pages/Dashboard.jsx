import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { colors, fonts, radius } from '../lib/theme'

const OR = '#f4701b'
const BL = '#9333ea'
const BG = '#0a0a0f'
const SURF = '#0d0d14'
const BORDER = '#161616'

export default function Dashboard() {
  const { isEditor, signOut } = useAuth()
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const q = supabase.from('series').select('*').order('created_at', { ascending: false })
      if (!isEditor) q.eq('published', true)
      const { data } = await q
      setSeries(data || [])
      setLoading(false)
    }
    fetch()
  }, [isEditor])

  const active = series.filter(s => s.status === 'in_progress')
  const completed = series.filter(s => s.status === 'complete')

  return (
    <div style={p.page}>
      {/* Header */}
      <div style={p.header}>
        <div>
          <div style={p.pageTitle}>THE ARCHIVE</div>
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
        <div style={p.content}>
          {active.length > 0 && (
            <section style={p.section}>
              <div style={p.sectionLabel}>
                <span style={p.liveDot} />
                IN PROGRESS
              </div>
              <div style={p.cardList}>
                {active.map(s => <SeriesCard key={s.id} s={s} live />)}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section style={p.section}>
              <div style={p.sectionLabel}>COMPLETED</div>
              <div style={p.cardList}>
                {completed.map(s => <SeriesCard key={s.id} s={s} />)}
              </div>
            </section>
          )}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
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
        {/* Teams row */}
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

        {/* Score */}
        <div style={c.scoreRow}>
          <span style={{ ...c.score, color: winsA >= winsB ? OR : '#555' }}>{winsA}</span>
          <span style={c.dash}>—</span>
          <span style={{ ...c.score, color: winsB >= winsA ? BL : '#555' }}>{winsB}</span>
        </div>

        {/* Split bar */}
        <div style={c.barWrap}>
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: `${pctA * 100}%`, background: `linear-gradient(90deg, ${OR}cc, ${OR})`, borderRadius: '2px 0 0 2px', transition: 'width 0.4s' }} />
            <div style={{ flex: 1, background: `linear-gradient(90deg, ${BL}, ${BL}cc)`, borderRadius: '0 2px 2px 0' }} />
          </div>
        </div>

        {/* Series name + meta */}
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
  content: {
    padding: '20px',
  },
  section: {
    marginBottom: 32,
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
