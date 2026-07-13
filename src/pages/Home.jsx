import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { isEditor, signOut } = useAuth()
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSeries() {
      const query = supabase
        .from('series')
        .select('*')
        .order('created_at', { ascending: false })

      if (!isEditor) query.eq('published', true)

      const { data, error } = await query
      if (!error) setSeries(data || [])
      setLoading(false)
    }
    fetchSeries()
  }, [isEditor])

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>NBA 2K26 PRO-AM</h1>
          <p style={styles.sub}>scooooorbooooord · Series History</p>
        </div>
        <div style={styles.actions}>
          {isEditor && (
            <Link to="/series/new" style={styles.btnPrimary}>+ New Series</Link>
          )}
          {isEditor && (
            <button onClick={signOut} style={styles.btnGhost}>Sign Out</button>
          )}
          {!isEditor && (
            <Link to="/login" style={styles.btnGhost}>Editor Login</Link>
          )}
        </div>
      </div>

      {loading ? (
        <p style={styles.dim}>Loading...</p>
      ) : series.length === 0 ? (
        <p style={styles.dim}>No series yet. {isEditor ? 'Create one above.' : ''}</p>
      ) : (
        <div style={styles.grid}>
          {series.map(s => (
            <Link key={s.id} to={`/series/${s.id}`} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardName}>{s.name}</span>
                <span style={{
                  ...styles.badge,
                  background: s.status === 'complete' ? '#1a3a1a' : '#1a2a3a',
                  color: s.status === 'complete' ? '#4caf50' : '#4da6ff',
                }}>
                  {s.status === 'complete' ? s.result_label || 'Complete' : 'In Progress'}
                </span>
              </div>
              <div style={styles.cardMeta}>
                {s.our_team_name} vs {s.opp_team_name}
              </div>
              {s.storyline && <div style={styles.cardStory}>{s.storyline}</div>}
              <div style={styles.cardScore}>
                {s.our_wins}–{s.opp_wins}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', padding: '2rem', maxWidth: 900, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' },
  title: { margin: 0, fontSize: '1.5rem', letterSpacing: '0.12em', color: '#fff' },
  sub: { margin: '0.25rem 0 0', color: '#666', fontSize: '0.85rem', letterSpacing: '0.08em' },
  actions: { display: 'flex', gap: '0.75rem', alignItems: 'center' },
  btnPrimary: { background: '#1d6ef5', color: '#fff', padding: '0.5rem 1rem', borderRadius: 4, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 },
  btnGhost: { background: 'transparent', color: '#888', border: '1px solid #333', padding: '0.5rem 1rem', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'none' },
  dim: { color: '#555', textAlign: 'center', marginTop: '4rem' },
  grid: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  card: { display: 'block', background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 6, padding: '1rem 1.25rem', textDecoration: 'none', color: 'inherit', transition: 'border-color 0.15s' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' },
  cardName: { fontWeight: 700, fontSize: '1rem', color: '#fff' },
  badge: { fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' },
  cardMeta: { color: '#666', fontSize: '0.82rem', marginBottom: '0.3rem' },
  cardStory: { color: '#aaa', fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.4rem' },
  cardScore: { color: '#fff', fontWeight: 700, fontSize: '1.1rem' },
}
