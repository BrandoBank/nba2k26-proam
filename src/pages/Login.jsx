import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError(error.message)
    else navigate('/')
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>NEXT STEP SERIES</h1>
        <p style={styles.sub}>Editor Access</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={styles.input}
          />
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </form>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: '#111',
    border: '1px solid #222',
    borderRadius: 8,
    padding: '2.5rem',
    width: 360,
    textAlign: 'center',
  },
  title: {
    color: '#fff',
    fontSize: '1.4rem',
    letterSpacing: '0.15em',
    margin: '0 0 0.25rem',
  },
  sub: {
    color: '#888',
    margin: '0 0 2rem',
    fontSize: '0.85rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  input: {
    background: '#000',
    border: '1px solid #333',
    borderRadius: 4,
    color: '#fff',
    padding: '0.6rem 0.8rem',
    fontSize: '0.95rem',
    outline: 'none',
  },
  btn: {
    background: '#1d6ef5',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '0.65rem',
    fontSize: '0.95rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  error: { color: '#e55', fontSize: '0.85rem', margin: 0 },
}
