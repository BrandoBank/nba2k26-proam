import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { colors, fonts, radius } from '../lib/theme'
import { IconArrow, IconChat, IconX } from '../lib/icons'

const POLL_MS = 20_000

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function Feed() {
  const navigate = useNavigate()
  const { gamertag: authGamertag } = useAuth()
  const [searchParams] = useSearchParams()
  const defaultQuote = searchParams.get('quote') || ''
  const { session, loading: authLoading } = useAuth()

  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [gamertag, setGamertag] = useState('')
  const [body, setBody] = useState('')
  const [quote, setQuote] = useState(defaultQuote)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')
  const composeRef = useRef(null)

  // Auto-scroll compose into view when a quote is pre-filled from landing
  useEffect(() => {
    if (defaultQuote && composeRef.current) {
      setTimeout(() => composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
    }
  }, [defaultQuote])

  async function fetchComments() {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setComments(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchComments()
    const id = setInterval(fetchComments, POLL_MS)
    return () => clearInterval(id)
  }, [])

  // Load player gamertag from auth session
  useEffect(() => {
    if (!session) { setGamertag(''); return }
    supabase
      .from('players')
      .select('gamertag')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.gamertag) { setGamertag(data.gamertag); return }
        // Fallback: match by email
        supabase
          .from('players')
          .select('gamertag')
          .eq('email', session.user.email)
          .maybeSingle()
          .then(({ data: d2 }) => { if (d2?.gamertag) setGamertag(d2.gamertag) })
      })
  }, [session])


  async function deleteComment(id) {
    await supabase.from('comments').delete().eq('id', id)
    setComments(prev => prev.filter(c => c.id !== id))
  }

  async function post() {
    if (!session || !gamertag.trim() || !body.trim()) return
    setPosting(true)
    setPostError('')
    const { error } = await supabase.from('comments').insert({
      gamertag: gamertag.trim(),
      body: body.trim(),
      quote_text: quote.trim() || null,
    })
    if (error) {
      setPostError('Failed to post. Try again.')
    } else {
      setBody('')
      setQuote('')
      await fetchComments()
    }
    setPosting(false)
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={() => navigate('/')} style={s.backBtn}>
          <IconArrow size={16} color={colors.textSecondary} dir="left" />
        </button>
        <div>
          <div style={s.pageTitle}>FEED</div>
          <div style={s.pageSub}>Live commentary · {comments.length} posts</div>
        </div>
      </div>

      {/* Page accent stripe */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, #f4701b, rgba(244,112,27,0.3) 50%, transparent)', width: '100%' }} />

      {/* Compose — auth-gated */}
      {!authLoading && !session ? (
        <div style={s.signInPrompt}>
          <span style={s.signInText}>Sign in to post</span>
          <button style={s.signInBtn} onClick={() => navigate('/login')}>Sign In</button>
        </div>
      ) : (
        <div style={s.compose} ref={composeRef}>
          {/* Quote preview */}
          {quote && (
            <div style={s.quotePreview}>
              <span style={s.quoteText}>{quote}</span>
              <button onClick={() => setQuote('')} style={s.quoteClose}>
                <IconX size={12} color={colors.textMuted} />
              </button>
            </div>
          )}

          {/* Gamertag — locked to session player */}
          <input
            style={{ ...s.input, opacity: 0.6, cursor: 'default' }}
            value={gamertag || (authLoading ? 'Loading...' : 'No player linked')}
            readOnly
          />

          <textarea
            style={s.textarea}
            placeholder="Say something about the leaderboard, a series, anyone's stats..."
            value={body}
            onChange={e => setBody(e.target.value.slice(0, 300))}
            rows={3}
          />
          <div style={s.composeFooter}>
            <span style={s.charCount}>{body.length}/300</span>
            {postError && <span style={{ color: colors.gTier, fontSize: 11 }}>{postError}</span>}
            <button
              style={{ ...s.postBtn, opacity: (!gamertag.trim() || !body.trim() || posting) ? 0.4 : 1 }}
              onClick={post}
              disabled={!gamertag.trim() || !body.trim() || posting}
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      <div style={s.feed}>
        {comments.length > 0 && (
          <div style={s.feedLabel}>LIVE COMMENTARY</div>
        )}
        {loading && <p style={s.dim}>Loading feed...</p>}
        {!loading && comments.length === 0 && (
          <p style={s.dim}>No posts yet. Be first.</p>
        )}
        {comments.map(c => (
          <div key={c.id} style={s.card}>
            {c.quote_text && (
              <div style={s.cardQuote}>
                <span style={s.cardQuoteBar} />
                <span style={s.cardQuoteText}>{c.quote_text}</span>
              </div>
            )}
            <div style={s.cardBody}>{c.body}</div>
            <div style={s.cardMeta}>
              <span style={s.cardTag}>{c.gamertag}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={s.cardTime}>{timeAgo(c.created_at)}</span>
                {authGamertag === 'BrandoBank' && (
                  <button onClick={() => deleteComment(c.id)} style={s.deleteBtn} title="Delete">
                    <IconX size={11} color="#555" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom padding for mobile nav */}
      <div style={{ height: 80 }} />
    </div>
  )
}

const s = {
  page: {
    minHeight: '100vh',
    background: colors.bg,
    color: colors.textPrimary,
    fontFamily: fonts.display,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '20px 20px 16px',
    borderBottom: `1px solid ${colors.border}`,
  },
  backBtn: {
    background: 'none',
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    padding: '6px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    color: colors.textSecondary,
    flexShrink: 0,
  },
  pageTitle: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontSize: 26,
    fontWeight: 900,
    letterSpacing: '0.12em',
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  pageSub: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  signInPrompt: {
    margin: '16px 16px 0',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: '20px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  signInText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: fonts.display,
  },
  signInBtn: {
    background: colors.orange,
    border: 'none',
    borderRadius: radius.sm,
    padding: '7px 18px',
    color: '#000',
    fontWeight: 800,
    fontSize: 13,
    fontFamily: fonts.display,
    letterSpacing: '0.05em',
    cursor: 'pointer',
  },
  compose: {
    margin: '16px 16px 0',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderLeft: '3px solid #f4701b',
    borderRadius: radius.lg,
    padding: '14px 14px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  quotePreview: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: `${colors.orange}10`,
    border: `1px solid ${colors.orange}30`,
    borderRadius: radius.md,
    padding: '7px 10px',
    gap: 8,
  },
  quoteText: {
    fontSize: 12,
    color: colors.orange,
    fontWeight: 600,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  quoteClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 2,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  input: {
    width: '100%',
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    padding: '9px 12px',
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.display,
    boxSizing: 'border-box',
    outline: 'none',
  },
  drop: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    zIndex: 10,
    maxHeight: 140,
    overflowY: 'auto',
  },
  dropItem: {
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 13,
    borderBottom: `1px solid ${colors.border}`,
  },
  textarea: {
    width: '100%',
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    padding: '9px 12px',
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.display,
    resize: 'none',
    boxSizing: 'border-box',
    outline: 'none',
    lineHeight: 1.5,
  },
  composeFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  charCount: {
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
  },
  postBtn: {
    background: colors.orange,
    border: 'none',
    borderRadius: radius.sm,
    padding: '7px 18px',
    color: '#000',
    fontWeight: 800,
    fontSize: 13,
    fontFamily: fonts.display,
    letterSpacing: '0.05em',
    cursor: 'pointer',
  },
  feed: {
    padding: '16px 16px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  dim: {
    color: colors.textMuted,
    fontSize: 13,
    padding: '24px 0',
    textAlign: 'center',
  },
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderLeft: '2px solid rgba(244,112,27,0.25)',
    borderRadius: radius.lg,
    padding: '12px 14px',
  },
  cardQuote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  cardQuoteBar: {
    display: 'inline-block',
    width: 3,
    minHeight: 16,
    background: colors.orange,
    borderRadius: 2,
    flexShrink: 0,
    marginTop: 2,
  },
  cardQuoteText: {
    fontSize: 11,
    color: colors.orange,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  cardBody: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 1.5,
    marginBottom: 10,
    wordBreak: 'break-word',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 3,
    color: '#333',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cardTag: {
    fontSize: 11,
    fontWeight: 700,
    color: '#f4701b',
    letterSpacing: '0.04em',
  },
  cardTime: {
    fontSize: 10,
    color: colors.textDim || colors.textMuted,
    letterSpacing: '0.04em',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 4px',
    display: 'flex',
    alignItems: 'center',
    opacity: 0.6,
  },
}
