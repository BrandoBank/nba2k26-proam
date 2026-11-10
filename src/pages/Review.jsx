import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { IconCheck, IconX } from '../lib/icons'

// Commissioner review queue — every contributor-submitted game lands here
// and stays off the public app until approved.
export default function Review() {
  const { isEditor, loading, gamertagLoading } = useAuth()
  const [subs, setSubs] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/review-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ action: 'list' }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Could not load queue'); setSubs([]); return }
    setSubs(data.submissions)
  }

  useEffect(() => { if (isEditor) load() }, [isEditor])

  if (loading || gamertagLoading) return <div style={s.page}><p style={s.dim}>Loading...</p></div>
  if (!isEditor) return <div style={s.page}><p style={s.dim}>Commissioner access required.</p></div>

  return (
    <div style={s.page}>
      <h1 style={s.title}>Review Queue</h1>
      <p style={s.sub}>Games players submitted. Nothing here is public until you approve it.</p>
      {error && <p style={{color:'#e55'}}>{error}</p>}
      {subs === null && <p style={s.dim}>Loading...</p>}
      {subs?.length === 0 && !error && <p style={s.dim}>Queue is empty — nothing waiting on you.</p>}
      <div style={s.list}>
        {subs?.map(sub => {
          const p = sub.payload
          const sum = side => (p[`${side}_players`] || []).reduce((a, r) => a + (+r.pts || 0), 0)
          const ourOk = sum('our') === +p.our_score
          const oppOk = sum('opp') === +p.opp_score
          return (
            <div key={sub.id} style={s.card}>
              {sub.image_url
                ? <a href={sub.image_url} target="_blank" rel="noreferrer"><img src={sub.image_url} alt="" style={s.thumb} /></a>
                : <div style={{...s.thumb, display:'grid', placeItems:'center', color:'#444'}}>no image</div>}
              <div style={s.body}>
                <div style={s.meta}>{sub.series?.name}</div>
                <div style={s.head}>
                  Game {sub.game_number} · {p.our_result} {p.our_score}–{p.opp_score}
                </div>
                <div style={s.small}>
                  by <b style={{color:'#ccc'}}>{sub.players?.gamertag || '?'}</b> · {new Date(sub.created_at).toLocaleString()}
                </div>
                <div style={{...s.small, display:'flex', gap:12, marginTop:6}}>
                  <span style={{display:'flex', alignItems:'center', gap:4}}>{sub.series?.our_team_name} Σ{sum('our')} {ourOk ? <IconCheck size={13} color="#4ade80" /> : <IconX size={13} color="#f87171" />}</span>
                  <span style={{display:'flex', alignItems:'center', gap:4}}>{sub.series?.opp_team_name} Σ{sum('opp')} {oppOk ? <IconCheck size={13} color="#4ade80" /> : <IconX size={13} color="#f87171" />}</span>
                </div>
                <Link to={`/series/${sub.series_id}/add-game?submission=${sub.id}`} style={s.btn}>Verify & approve →</Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s = {
  page: { minHeight:'100vh', background:'#000', color:'#fff', padding:'2rem 1rem 6rem', maxWidth:900, margin:'0 auto' },
  title: { margin:'0 0 0.3rem', fontSize:'1.3rem', letterSpacing:'0.08em' },
  sub: { color:'#666', fontSize:'0.85rem', margin:'0 0 1.5rem' },
  dim: { color:'#555' },
  list: { display:'flex', flexDirection:'column', gap:'0.9rem' },
  card: { display:'flex', gap:'1rem', background:'#080808', border:'1px solid #1a1a1a', borderRadius:8, padding:'0.85rem', flexWrap:'wrap' },
  thumb: { width:220, maxWidth:'100%', height:124, objectFit:'cover', borderRadius:5, border:'1px solid #1a1a1a', background:'#0d0d0d' },
  body: { flex:'1 1 220px', minWidth:0 },
  meta: { color:'#9333ea', fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700 },
  head: { fontSize:'1rem', fontWeight:700, margin:'0.2rem 0' },
  small: { color:'#777', fontSize:'0.78rem' },
  btn: { display:'inline-block', marginTop:'0.7rem', background:'#f4701b', color:'#fff', borderRadius:4, padding:'0.45rem 0.9rem', fontSize:'0.82rem', fontWeight:700, textDecoration:'none' },
}
