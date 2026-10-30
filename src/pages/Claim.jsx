import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { colors, fonts } from '../lib/theme'
import { IconBall, IconTrophy, IconCheck } from '../lib/icons'
import { useCareerStats } from '../hooks/useCareerStats'

const OR = colors.orange

export default function Claim() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { data: careerRows } = useCareerStats()
  const careers = Object.fromEntries(careerRows.map(r => [r.gamertag, r]))

  const [players, setPlayers] = useState([])
  const [currentClaim, setCurrentClaim] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) { navigate('/login'); return }
    loadPlayers()
  }, [session])

  async function loadPlayers() {
    setLoading(true)
    const { data: mine } = await supabase
      .from('players')
      .select('gamertag,display_name')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (mine) {
      // Already claimed — show current claim with release option instead of redirecting
      setCurrentClaim(mine)
      setLoading(false)
      return
    }

    const { data: unclaimed } = await supabase
      .from('players')
      .select('gamertag,display_name')
      .is('user_id', null)
      .order('gamertag')

    setPlayers(unclaimed || [])
    setLoading(false)
  }

  async function handleClaim() {
    if (!selected) return
    setClaiming(true)
    setError('')
    const { error } = await supabase
      .from('players')
      .update({ user_id: session.user.id })
      .eq('gamertag', selected)
      .is('user_id', null)
    if (error) {
      setError('Could not claim that player. They may have just been claimed. Try another.')
      setClaiming(false)
      await loadPlayers()
      return
    }
    navigate('/')
  }

  async function handleRelease() {
    setReleasing(true)
    setError('')
    const { error } = await supabase
      .from('players')
      .update({ user_id: null })
      .eq('gamertag', currentClaim.gamertag)
      .eq('user_id', session.user.id)
    setReleasing(false)
    if (error) {
      setError('Could not release claim. Contact the commissioner.')
      return
    }
    setCurrentClaim(null)
    setConfirmRelease(false)
    setSelected(null)
    await loadPlayers()
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.center}>
          <IconBall size={24} color={OR} />
          <p style={s.dim}>Loading players...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.inner}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.logo}><IconBall size={16} color={OR} /><span>NEXT UP</span></div>
          <h1 style={s.title}>CLAIM YOUR PLAYER</h1>
          <p style={s.sub}>Pick yourself from the roster. Your account will be permanently linked to that player's stats.</p>
        </div>

        {/* Already claimed — show current + release option */}
        {currentClaim ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: 'rgba(244,112,27,0.06)', border: '1px solid rgba(244,112,27,0.2)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={s.avatar}>{(currentClaim.display_name || currentClaim.gamertag)[0].toUpperCase()}</div>
              <div style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '1.3rem', letterSpacing: '0.08em', color: '#fff', marginTop: 10 }}>
                {currentClaim.display_name || currentClaim.gamertag}
              </div>
              {currentClaim.display_name && currentClaim.display_name !== currentClaim.gamertag && (
                <div style={{ color: '#444', fontSize: '0.75rem', marginTop: 2 }}>{currentClaim.gamertag}</div>
              )}
              <div style={{ color: '#22c55e', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 8 }}>
                ✓ Your claimed player
              </div>
            </div>
            <button onClick={() => navigate('/')} style={{ ...s.btn, marginBottom: 12 }}>
              Go to Home
            </button>
            {!confirmRelease ? (
              <button
                onClick={() => setConfirmRelease(true)}
                style={{ background: 'none', border: '1px solid #222', borderRadius: 6, color: '#555', padding: '0.6rem 1rem', fontSize: '0.8rem', cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}
              >
                This isn't me — I claimed the wrong player
              </button>
            ) : (
              <div style={{ border: '1px solid #ef4444', borderRadius: 10, padding: '1rem', background: 'rgba(239,68,68,0.05)' }}>
                <p style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.5rem', fontFamily: "'Barlow Condensed', system-ui, sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}>Release Claim?</p>
                <p style={{ color: '#666', fontSize: '0.78rem', lineHeight: 1.6, margin: '0 0 1rem' }}>
                  This will unlink your account from <strong style={{ color: '#aaa' }}>{currentClaim.display_name || currentClaim.gamertag}</strong> so you can claim the correct player. The stats stay on the player — only the account link is removed.
                </p>
                {error && <p style={s.error}>{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setConfirmRelease(false)} style={{ flex: 1, background: '#111', border: '1px solid #222', borderRadius: 6, color: '#aaa', padding: '0.6rem', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                  <button onClick={handleRelease} disabled={releasing} style={{ flex: 1, background: '#ef4444', border: 'none', borderRadius: 6, color: '#fff', padding: '0.6rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {releasing ? 'Releasing...' : 'Yes, Release'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Player grid — only show when not already claimed */}
        {!currentClaim && (players.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏀</div>
            <p style={{ color: '#fff', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.08em', marginBottom: 8 }}>ALL TAGS CLAIMED</p>
            <p style={{ color: '#555', fontSize: '0.85rem', lineHeight: 1.7, maxWidth: 340, margin: '0 auto' }}>
              Every player tag in the system is already linked to an account. If you play in the league and your name isn't here, text the commissioner to get added to the roster.
            </p>
          </div>
        ) : (
          <div style={s.grid}>
            {players.map(p => {
              const c = careers[p.gamertag]
              const isSelected = selected === p.gamertag
              return (
                <button
                  key={p.gamertag}
                  onClick={() => setSelected(p.gamertag)}
                  style={{ ...s.card, ...(isSelected ? s.cardSelected : {}) }}
                >
                  {isSelected && (
                    <div style={s.checkBadge}><IconCheck size={11} color="#000" /></div>
                  )}
                  <div style={s.avatar}>
                    {(p.display_name || p.gamertag)[0].toUpperCase()}
                  </div>
                  <div style={s.cardName}>{p.display_name || p.gamertag}</div>
                  {p.display_name && p.display_name !== p.gamertag && (
                    <div style={s.cardTag}>{p.gamertag}</div>
                  )}
                  {c && c.total_gp > 0 ? (
                    <div style={s.statsRow}>
                      <span style={s.stat}><span style={{ color: OR }}>{Number(c.career_ppg).toFixed(1)}</span> PPG</span>
                      <span style={s.stat}><span style={{ color: '#60a5fa' }}>{Number(c.career_apg).toFixed(1)}</span> APG</span>
                      <span style={s.stat}><span style={{ color: '#a78bfa' }}>{Number(c.career_rpg).toFixed(1)}</span> RPG</span>
                    </div>
                  ) : (
                    <div style={s.statsRow}><span style={s.noStats}>No games yet</span></div>
                  )}
                  {c?.elite_count > 0 && (
                    <div style={s.eliteBadge}>
                      <IconTrophy size={9} color={colors.elite} />
                      <span>{c.elite_count}× ELITE</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ))}

        {/* "Not seeing your name?" help text */}
        {!currentClaim && players.length > 0 && (
          <p style={{ ...s.dim, fontSize: '0.75rem', marginBottom: 16, textAlign: 'center' }}>
            Don't see your name? Text the commissioner to get added to the roster.
          </p>
        )}

        {/* Confirm */}
        {!currentClaim && selected && (
          <div style={s.confirm}>
            <p style={s.confirmText}>
              Claiming <strong style={{ color: OR }}>{selected}</strong> — this cannot be undone.
            </p>
            {error && <p style={s.error}>{error}</p>}
            <button onClick={handleClaim} disabled={claiming} style={s.btn}>
              {claiming ? 'Claiming...' : `Confirm — I'm ${selected}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100vh',
    background: '#000',
    color: '#fff',
    fontFamily: fonts.display,
    paddingBottom: 40,
  },
  inner: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '2rem 1rem',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: 12,
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 900,
    fontSize: '1rem',
    letterSpacing: '0.28em',
    color: '#fff',
    textTransform: 'uppercase',
    marginBottom: '1.25rem',
  },
  title: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 900,
    fontSize: '2rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    margin: '0 0 0.5rem',
    color: '#fff',
  },
  sub: {
    color: '#555',
    fontSize: '0.85rem',
    lineHeight: 1.6,
    margin: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  card: {
    position: 'relative',
    background: '#0a0a0a',
    border: '1px solid #1a1a1a',
    borderRadius: 10,
    padding: '1rem',
    cursor: 'pointer',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    transition: 'border-color 0.15s',
    fontFamily: fonts.display,
  },
  cardSelected: {
    border: `1px solid ${OR}`,
    background: `rgba(244,112,27,0.06)`,
    boxShadow: `0 0 16px rgba(244,112,27,0.1)`,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: OR,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: 'linear-gradient(135deg,#1a1a1a,#222)',
    border: '1px solid #2a2a2a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 900,
    fontSize: '1.3rem',
    color: OR,
    marginBottom: 2,
  },
  cardName: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 800,
    fontSize: '0.95rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#fff',
  },
  cardTag: {
    fontSize: '0.68rem',
    color: '#444',
    letterSpacing: '0.04em',
  },
  statsRow: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
    justifyContent: 'center',
  },
  stat: {
    fontSize: '0.68rem',
    color: '#555',
    fontWeight: 600,
  },
  noStats: {
    fontSize: '0.65rem',
    color: '#2a2a2a',
    fontStyle: 'italic',
  },
  eliteBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    fontSize: '0.62rem',
    color: colors.elite,
    fontWeight: 700,
    letterSpacing: '0.06em',
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    textTransform: 'uppercase',
  },
  confirm: {
    position: 'sticky',
    bottom: 16,
    background: '#0d0d0d',
    border: `1px solid ${OR}`,
    borderRadius: 10,
    padding: '1rem',
    textAlign: 'center',
  },
  confirmText: {
    color: '#aaa',
    fontSize: '0.85rem',
    margin: '0 0 0.75rem',
    lineHeight: 1.5,
  },
  btn: {
    background: OR,
    color: '#000',
    border: 'none',
    borderRadius: 6,
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: 900,
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    width: '100%',
  },
  error: {
    color: '#ef4444',
    fontSize: '0.8rem',
    margin: '0 0 0.75rem',
  },
  dim: {
    color: '#444',
    fontSize: '0.85rem',
    textAlign: 'center',
    lineHeight: 1.6,
  },
}
