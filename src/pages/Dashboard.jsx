import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

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
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <Link to="/" style={s.logoLink}>NEXT STEP SERIES</Link>
          <p style={s.sub}>All Series</p>
        </div>
        <div style={s.actions}>
          {isEditor && <Link to="/series/new" style={s.btnPrimary}>+ New Series</Link>}
          {isEditor && <button onClick={signOut} style={s.btnGhost}>Sign Out</button>}
          {!isEditor && <Link to="/login" style={s.btnGhost}>Editor Login</Link>}
        </div>
      </div>

      {loading ? (
        <p style={s.dim}>Loading...</p>
      ) : series.length === 0 ? (
        <div style={s.empty}>
          <p style={s.emptyTitle}>No series yet.</p>
          {isEditor && <Link to="/series/new" style={s.btnPrimary}>Start the First One</Link>}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section style={s.section}>
              <h2 style={s.sectionTitle}>
                <span style={s.dot} />
                In Progress
              </h2>
              <div style={s.grid}>
                {active.map(s => <SeriesCard key={s.id} s={s} />)}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section style={s.section}>
              <h2 style={{...s.sectionTitle, color: '#444'}}>Completed</h2>
              <div style={s.grid}>
                {completed.map(s => <SeriesCard key={s.id} s={s} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function SeriesCard({ s }) {
  const isWin = s.our_wins > s.opp_wins
  return (
    <Link to={`/series/${s.id}`} style={c.card}>
      <div style={c.top}>
        <div>
          <div style={c.name}>{s.name}</div>
          <div style={c.teams}>{s.our_team_name} <span style={c.vs}>vs</span> {s.opp_team_name}</div>
        </div>
        <div style={{
          ...c.badge,
          background: s.status === 'complete' ? (isWin ? '#0d2a0d' : '#2a0d0d') : '#0a1a2a',
          color: s.status === 'complete' ? (isWin ? '#4caf50' : '#e53935') : '#4da6ff',
          border: `1px solid ${s.status === 'complete' ? (isWin ? '#1a4a1a' : '#4a1a1a') : '#1a3a5a'}`,
        }}>
          {s.status === 'complete' ? (s.result_label || (isWin ? 'W' : 'L')) : 'LIVE'}
        </div>
      </div>
      {s.storyline && <p style={c.story}>{s.storyline}</p>}
      <div style={c.score}>
        <span style={{color: '#fff', fontWeight: 800, fontSize: '1.4rem'}}>{s.our_wins}</span>
        <span style={{color: '#333', margin: '0 0.4rem', fontSize: '1rem'}}>–</span>
        <span style={{color: '#555', fontWeight: 700, fontSize: '1.4rem'}}>{s.opp_wins}</span>
      </div>
    </Link>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', padding: '2rem', maxWidth: 1000, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', gap: '1rem', flexWrap: 'wrap' },
  logoLink: { fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.15em', color: '#fff', textDecoration: 'none' },
  sub: { color: '#444', fontSize: '0.8rem', margin: '0.25rem 0 0', letterSpacing: '0.06em' },
  actions: { display: 'flex', gap: '0.75rem', alignItems: 'center' },
  btnPrimary: { background: '#1d6ef5', color: '#fff', padding: '0.5rem 1.1rem', borderRadius: 6, textDecoration: 'none', fontSize: '0.88rem', fontWeight: 700 },
  btnGhost: { background: 'transparent', color: '#555', border: '1px solid #222', padding: '0.5rem 1rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.88rem', textDecoration: 'none' },
  dim: { color: '#444', textAlign: 'center', marginTop: '4rem' },
  empty: { textAlign: 'center', padding: '5rem 0' },
  emptyTitle: { color: '#444', marginBottom: '1.5rem', fontSize: '1rem' },
  section: { marginBottom: '2.5rem' },
  sectionTitle: { color: '#555', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  dot: { width: 6, height: 6, borderRadius: '50%', background: '#4da6ff', display: 'inline-block' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: '#111', border: '1px solid #111' },
}

const c = {
  card: { display: 'block', background: '#000', padding: '1.25rem 1.5rem', textDecoration: 'none', color: 'inherit', transition: 'background 0.1s' },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem', gap: '0.75rem' },
  name: { fontWeight: 700, fontSize: '0.95rem', color: '#fff', marginBottom: '0.2rem' },
  teams: { color: '#444', fontSize: '0.78rem' },
  vs: { color: '#2a2a2a', margin: '0 0.3rem' },
  badge: { fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: 4, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' },
  story: { color: '#555', fontSize: '0.8rem', lineHeight: 1.5, margin: '0 0 0.75rem', fontStyle: 'italic' },
  score: { display: 'flex', alignItems: 'center' },
}
