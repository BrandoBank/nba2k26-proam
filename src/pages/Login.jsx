import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { colors, fonts } from '../lib/theme'
import { IconBall, IconCheck } from '../lib/icons'

const OR = colors.orange

export default function Login() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signedUp, setSignedUp] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [isRecovery, setIsRecovery] = useState(false)
  const [recovered, setRecovered] = useState(false)

  useEffect(() => {
    if (session) navigate('/')
  }, [session])

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery') || hash.includes('type=email')) {
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setIsRecovery(true)
      })
    }
  }, [])

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error } = await signIn(email, password)
    setLoading(false)
    if (error) { setError(error.message); return }
    // Check if they've claimed a player yet
    const { data: claimed } = await supabase
      .from('players')
      .select('gamertag')
      .eq('user_id', data.user.id)
      .maybeSingle()
    navigate(claimed ? '/' : '/claim')
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSignedUp(true)
  }

  async function handleSetPassword(e) {
    e.preventDefault()
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (error) { setError(error.message); return }
    setRecovered(true)
    setTimeout(() => navigate('/'), 1500)
  }

  if (isRecovery) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.logo}><IconBall size={18} color={OR} /><span>NEXT UP</span></div>
          <p style={s.sub}>Set New Password</p>
          {recovered ? (
            <p style={{ color: colors.statGreen, fontSize: '0.9rem', textAlign: 'center' }}>
              <IconCheck size={14} color={colors.statGreen} /> Password set — redirecting...
            </p>
          ) : (
            <form onSubmit={handleSetPassword} style={s.form}>
              <input type="password" placeholder="New password (min 8 chars)" value={newPassword}
                onChange={e => setNewPassword(e.target.value)} required style={s.input} autoFocus />
              <button type="submit" disabled={loading} style={s.btn}>
                {loading ? 'Saving...' : 'Set Password'}
              </button>
              {error && <p style={s.error}>{error}</p>}
            </form>
          )}
        </div>
      </div>
    )
  }

  if (signedUp) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.logo}><IconBall size={18} color={OR} /><span>NEXT UP</span></div>
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>
              <IconCheck size={32} color={colors.statGreen} />
            </div>
            <p style={{ color: '#fff', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              ACCOUNT CREATED
            </p>
            <p style={{ color: '#666', fontSize: '0.85rem', lineHeight: 1.6 }}>
              Check <strong style={{ color: '#aaa' }}>{email}</strong> for a confirmation link, then come back and sign in.
            </p>
            <button onClick={() => { setSignedUp(false); setTab('signin') }} style={{ ...s.btn, marginTop: '1.5rem' }}>
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Logo */}
        <Link to="/" style={s.logo}>
          <IconBall size={18} color={OR} />
          <span>NEXT UP</span>
        </Link>

        {/* Tabs */}
        <div style={s.tabs}>
          <button onClick={() => { setTab('signin'); setError('') }} style={{ ...s.tabBtn, ...(tab === 'signin' ? s.tabActive : {}) }}>
            Sign In
          </button>
          <button onClick={() => { setTab('signup'); setError('') }} style={{ ...s.tabBtn, ...(tab === 'signup' ? s.tabActive : {}) }}>
            Create Account
          </button>
        </div>

        {tab === 'signin' ? (
          <form onSubmit={handleSignIn} style={s.form}>
            <input type="email" placeholder="Email" value={email}
              onChange={e => setEmail(e.target.value)} required style={s.input} autoComplete="email" />
            <input type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} required style={s.input} autoComplete="current-password" />
            <button type="submit" disabled={loading} style={s.btn}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            {error && <p style={s.error}>{error}</p>}
          </form>
        ) : (
          <form onSubmit={handleSignUp} style={s.form}>
            <div style={s.fieldHint}>Create your account — you'll pick your player profile after confirming your email.</div>
            <input type="email" placeholder="Email" value={email}
              onChange={e => setEmail(e.target.value)} required style={s.input} autoComplete="email" />
            <input type="password" placeholder="Password (min 8 chars)" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={8} style={s.input} autoComplete="new-password" />
            <button type="submit" disabled={loading} style={s.btn}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
            {error && <p style={s.error}>{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100vh',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    fontFamily: fonts.display,
    paddingBottom: 80,
  },
  card: {
    background: '#0a0a0a',
    border: '1px solid #1a1a1a',
    borderRadius: 12,
    padding: '2rem 1.75rem',
    width: '100%',
    maxWidth: 380,
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    textDecoration: 'none',
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 900,
    fontSize: '1.3rem',
    letterSpacing: '0.28em',
    color: '#fff',
    textTransform: 'uppercase',
    justifyContent: 'center',
  },
  sub: {
    color: '#555',
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    textAlign: 'center',
    margin: 0,
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 700,
  },
  tabs: {
    display: 'flex',
    background: '#111',
    borderRadius: 8,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    flex: 1,
    background: 'none',
    border: 'none',
    borderRadius: 6,
    color: '#555',
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 700,
    fontSize: '0.85rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '0.5rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: OR,
    color: '#000',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem',
  },
  fieldHint: {
    color: '#444',
    fontSize: '0.75rem',
    letterSpacing: '0.04em',
    lineHeight: 1.5,
  },
  input: {
    background: '#000',
    border: '1px solid #222',
    borderRadius: 6,
    color: '#fff',
    padding: '0.7rem 0.85rem',
    fontSize: '0.9rem',
    fontFamily: fonts.display,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  drop: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#111',
    border: '1px solid #222',
    borderRadius: 6,
    zIndex: 10,
    maxHeight: 180,
    overflowY: 'auto',
    marginTop: 2,
  },
  dropItem: {
    padding: '9px 12px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    borderBottom: '1px solid #1a1a1a',
    color: '#ccc',
  },
  btn: {
    background: OR,
    color: '#000',
    border: 'none',
    borderRadius: 6,
    padding: '0.75rem',
    fontSize: '0.95rem',
    fontWeight: 800,
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    letterSpacing: '0.08em',
    cursor: 'pointer',
    marginTop: '0.25rem',
  },
  error: {
    color: '#ef4444',
    fontSize: '0.82rem',
    margin: 0,
    textAlign: 'center',
  },
}
