import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

function autoSeriesName(format) {
  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'short' })
  const day = now.getDate()
  return `${month} ${day} · BO${format}`
}

function PlayerSearch({ value, onChange, placeholder }) {
  const [query, setQuery] = useState(value || '')
  const [players, setPlayers] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [locked, setLocked] = useState(!!value)
  const ref = useRef(null)

  useEffect(() => {
    supabase.from('players').select('id, gamertag, display_name').order('gamertag')
      .then(({ data }) => setPlayers(data || []))
  }, [])

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    setLocked(false)
    onChange('')
    if (q.length < 1) { setSuggestions([]); setOpen(false); return }
    const lower = q.toLowerCase()
    const matches = players.filter(p =>
      p.gamertag.toLowerCase().includes(lower) ||
      (p.display_name || '').toLowerCase().includes(lower)
    ).slice(0, 6)
    setSuggestions(matches)
    setOpen(matches.length > 0)
  }

  function select(player) {
    setQuery(player.gamertag)
    onChange(player.gamertag)
    setLocked(true)
    setOpen(false)
    setSuggestions([])
  }

  function clear() {
    setQuery('')
    onChange('')
    setLocked(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <div style={{ position: 'relative' }}>
        <input
          style={{
            ...s.input,
            paddingRight: locked ? '2rem' : '0.8rem',
            borderColor: locked ? '#3a3a3a' : '#2a2a2a',
          }}
          value={query}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {locked && (
          <button type="button" onClick={clear} style={s.clearBtn}>✕</button>
        )}
      </div>
      {open && (
        <div style={s.dropdown}>
          {suggestions.map(p => (
            <div key={p.id} style={s.suggestion} onMouseDown={() => select(p)}>
              <span style={s.suggTag}>{p.gamertag}</span>
              {p.display_name && p.display_name !== p.gamertag && (
                <span style={s.suggName}>{p.display_name}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NewSeries() {
  const { isEditor } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    our_team_name: '',
    opp_team_name: '',
    format: 7,
    storyline: '',
    drafter_1: '',
    drafter_2: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!isEditor) return <div style={s.page}><p style={s.dim}>Not authorized.</p></div>

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const fmt = Number(form.format)
    const name = form.name.trim() || autoSeriesName(fmt)

    const d1 = form.drafter_1.trim()
    const d2 = form.drafter_2.trim()
    const drafted_by = d1 && d2 ? `${d1} vs ${d2}` : (d1 || d2 || null)

    const { data, error } = await supabase
      .from('series')
      .insert({
        name,
        our_team_name: form.our_team_name.trim(),
        opp_team_name: form.opp_team_name.trim(),
        format: fmt,
        storyline: form.storyline.trim() || null,
        drafted_by,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    setSaving(false)
    if (error) { setError(error.message); return }
    navigate(`/series/${data.id}`)
  }

  const namePlaceholder = autoSeriesName(form.format)

  return (
    <div style={s.page}>
      <Link to="/" style={s.back}>← Back</Link>
      <h1 style={s.title}>New Series</h1>
      <form onSubmit={handleSubmit} style={s.form}>
        <label style={s.label}>Series Name <span style={s.opt}>(optional — auto-fills with date)</span>
          <input style={s.input} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder={namePlaceholder} />
        </label>
        <div style={s.teamRow}>
          <label style={{...s.label, flex: 1}}>Team 1
            <input style={s.input} value={form.our_team_name} onChange={e => setForm(f => ({...f, our_team_name: e.target.value}))} placeholder="Team name" required />
          </label>
          <div style={s.vs}>VS</div>
          <label style={{...s.label, flex: 1}}>Team 2
            <input style={s.input} value={form.opp_team_name} onChange={e => setForm(f => ({...f, opp_team_name: e.target.value}))} placeholder="Team name" required />
          </label>
        </div>
        <label style={s.label}>Format
          <select style={s.input} value={form.format} onChange={e => setForm(f => ({...f, format: e.target.value}))}>
            <option value={3}>Best of 3</option>
            <option value={5}>Best of 5</option>
            <option value={7}>Best of 7</option>
          </select>
        </label>
        <div style={s.label}>
          Draft <span style={s.opt}>(optional — players who drafted)</span>
          <div style={s.teamRow}>
            <PlayerSearch
              value={form.drafter_1}
              onChange={v => setForm(f => ({...f, drafter_1: v}))}
              placeholder="Drafter 1"
            />
            <div style={s.vs}>VS</div>
            <PlayerSearch
              value={form.drafter_2}
              onChange={v => setForm(f => ({...f, drafter_2: v}))}
              placeholder="Drafter 2"
            />
          </div>
        </div>
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
  input: { background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 4, color: '#fff', padding: '0.6rem 0.8rem', fontSize: '0.95rem', outline: 'none', width: '100%', boxSizing: 'border-box' },
  opt: { color: '#555', textTransform: 'none', letterSpacing: 0 },
  teamRow: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  vs: { color: '#333', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '0.1em', paddingTop: '0.75rem', flexShrink: 0 },
  btn: { background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: 4, padding: '0.75rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem' },
  error: { color: '#e55', fontSize: '0.85rem' },
  dim: { color: '#555' },
  clearBtn: { position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem', lineHeight: 1 },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#111', border: '1px solid #2a2a2a', borderRadius: 4, zIndex: 100, marginTop: 2, overflow: 'hidden' },
  suggestion: { padding: '0.5rem 0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #1a1a1a' },
  suggTag: { color: '#fff', fontSize: '0.9rem', fontWeight: 600 },
  suggName: { color: '#555', fontSize: '0.78rem' },
}
