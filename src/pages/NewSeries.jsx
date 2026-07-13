import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function NewSeries() {
  const { isEditor } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    our_team_name: 'scooooorbooooord',
    opp_team_name: '',
    format: 7,
    storyline: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!isEditor) return <div style={s.page}><p style={s.dim}>Not authorized.</p></div>

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { data, error } = await supabase
      .from('series')
      .insert({
        name: form.name.trim(),
        our_team_name: form.our_team_name.trim(),
        opp_team_name: form.opp_team_name.trim(),
        format: Number(form.format),
        storyline: form.storyline.trim() || null,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    setSaving(false)
    if (error) { setError(error.message); return }
    navigate(`/series/${data.id}`)
  }

  return (
    <div style={s.page}>
      <Link to="/" style={s.back}>← Back</Link>
      <h1 style={s.title}>New Series</h1>
      <form onSubmit={handleSubmit} style={s.form}>
        <label style={s.label}>Series Name
          <input style={s.input} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Redraft Series · July" required />
        </label>
        <label style={s.label}>Our Team Name
          <input style={s.input} value={form.our_team_name} onChange={e => setForm(f => ({...f, our_team_name: e.target.value}))} required />
        </label>
        <label style={s.label}>Opponent Team Name
          <input style={s.input} value={form.opp_team_name} onChange={e => setForm(f => ({...f, opp_team_name: e.target.value}))} placeholder="HOOPAAAAAAAs" required />
        </label>
        <label style={s.label}>Format
          <select style={s.input} value={form.format} onChange={e => setForm(f => ({...f, format: e.target.value}))}>
            <option value={3}>Best of 3</option>
            <option value={5}>Best of 5</option>
            <option value={7}>Best of 7</option>
          </select>
        </label>
        <label style={s.label}>Storyline <span style={s.opt}>(optional)</span>
          <textarea style={{...s.input, height: 70, resize: 'vertical'}} value={form.storyline} onChange={e => setForm(f => ({...f, storyline: e.target.value}))} placeholder="Series narrative for the banner..." />
        </label>
        {error && <p style={s.error}>{error}</p>}
        <button type="submit" disabled={saving} style={s.btn}>{saving ? 'Creating...' : 'Create Series'}</button>
      </form>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', padding: '2rem', maxWidth: 600, margin: '0 auto' },
  back: { color: '#666', textDecoration: 'none', fontSize: '0.85rem', display: 'block', marginBottom: '1.5rem' },
  title: { margin: '0 0 1.5rem', fontSize: '1.3rem', letterSpacing: '0.1em' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.35rem', color: '#aaa', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em' },
  input: { background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 4, color: '#fff', padding: '0.6rem 0.8rem', fontSize: '0.95rem', outline: 'none', width: '100%' },
  opt: { color: '#555', textTransform: 'none', letterSpacing: 0 },
  btn: { background: '#1d6ef5', color: '#fff', border: 'none', borderRadius: 4, padding: '0.75rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem' },
  error: { color: '#e55', fontSize: '0.85rem' },
  dim: { color: '#555' },
}
