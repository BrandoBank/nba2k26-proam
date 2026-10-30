import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { colors } from '../lib/theme'
import { supabase } from '../lib/supabase'
import './MobileNav.css'

const OR = colors.orange

export default function MobileNav() {
  const { pathname } = useLocation()
  const { isEditor, session, signOut, gamertag } = useAuth()
  const [calloutCount, setCalloutCount] = useState(0)

  useEffect(() => {
    if (!gamertag) return
    let playerId = null
    supabase.from('players').select('id').eq('gamertag', gamertag).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        playerId = data.id
        supabase.from('callouts').select('id', { count: 'exact', head: true }).eq('challenged_id', playerId).eq('status', 'pending')
          .then(({ count }) => setCalloutCount(count || 0))
        const channel = supabase.channel('callout-nav-' + playerId)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'callouts', filter: `challenged_id=eq.${playerId}` },
            () => setCalloutCount(c => c + 1))
          .subscribe()
      })
  }, [gamertag])

  const active = (path) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const isSeriesActive = active('/leagues') || (pathname.startsWith('/series') && !pathname.startsWith('/series/new'))

  return (
    <>
      {/* Desktop top bar — hidden on mobile */}
      <nav className="desktop-topbar">
        <Link to="/" style={dt.logo}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={OR} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3c0 4.97 3 9 7 10.5M12 3c0 4.97-3 9-7 10.5"/><path d="M5.5 19.5C7 16 9 13 12 12s5-4 6.5-7.5"/></svg>
          <span>NEXT UP</span>
        </Link>
        <div style={dt.links}>
          <DesktopLink to="/" label="Home" active={active('/')} />
          <DesktopLink to="/leagues" label="Series" active={isSeriesActive} />
          <DesktopLink to="/feed" label="Feed" active={active('/feed')} />
          <DesktopLink to="/history" label="History" active={active('/history')} />
          <DesktopLink to="/rivalries" label="Rivalries" active={active('/rivalries')} />
          {isEditor && <DesktopLink to="/series/new" label="+ New" active={active('/series/new')} accent />}
        </div>
        <div style={dt.right}>
          {session ? (
            <>
              <Link to={gamertag ? `/player/${gamertag}` : '/claim'} style={dt.profile}>
                <div style={{ position: 'relative' }}>
                  <div style={dt.avatar}>{(gamertag?.[0] || session.user.email?.[0] || 'U').toUpperCase()}</div>
                  {calloutCount > 0 && <div style={dt.badge}>{calloutCount}</div>}
                </div>
                <span style={dt.profileLabel}>{(gamertag || session.user.email?.split('@')[0] || '').toUpperCase()}</span>
              </Link>
              <button onClick={signOut} style={dt.signOut}>OUT</button>
            </>
          ) : (
            <Link to="/login" style={dt.signIn}>Sign In</Link>
          )}
        </div>
      </nav>

      {/* Mobile bottom bar — hidden on desktop */}
      <nav className="mobile-nav">
        <NavItem to="/" label="Home" active={active('/')} icon={<HomeIcon />} />
        <NavItem to="/leagues" label="Series" active={isSeriesActive} icon={<BallIcon />} />
        <NavItem to="/feed" label="Feed" active={active('/feed')} icon={<FeedIcon />} />
        <NavItem to="/history" label="History" active={active('/history')} icon={<ChartIcon />} />
        <NavItem to="/rivalries" label="Rivals" active={active('/rivalries')} icon={<SwordsIcon />} badge={calloutCount} />
        {isEditor && <NavItem to="/series/new" label="+ New" active={active('/series/new')} icon={<PlusIcon />} accent />}
      </nav>
    </>
  )
}

function DesktopLink({ to, label, active, accent }) {
  return (
    <Link to={to} style={{
      color: accent ? OR : active ? '#fff' : '#555',
      textDecoration: 'none',
      fontFamily: "'Barlow Condensed', system-ui, sans-serif",
      fontWeight: 700,
      fontSize: '0.85rem',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      padding: '0.35rem 0.75rem',
      borderRadius: 5,
      background: active ? 'rgba(244,112,27,0.08)' : 'transparent',
      border: `1px solid ${active ? 'rgba(244,112,27,0.15)' : 'transparent'}`,
    }}>
      {label}
    </Link>
  )
}

const dt = {
  logo: { display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.28em', color: '#fff', textTransform: 'uppercase' },
  links: { display: 'flex', alignItems: 'center', gap: 4 },
  right: { display: 'flex', alignItems: 'center', gap: 8 },
  profile: { display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' },
  avatar: { width: 28, height: 28, borderRadius: '50%', background: OR, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '0.85rem', color: '#000', flexShrink: 0 },
  profileLabel: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: '#888', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  signOut: { background: 'none', border: '1px solid #222', borderRadius: 4, color: '#444', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '0.2rem 0.45rem', cursor: 'pointer', fontFamily: "'Barlow Condensed', system-ui, sans-serif" },
  signIn: { background: 'transparent', border: '1px solid #2a2a2a', color: '#666', textDecoration: 'none', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '0.8rem', fontWeight: 700, padding: '0.3rem 0.8rem', borderRadius: 5, letterSpacing: '0.1em', textTransform: 'uppercase' },
  badge: { position: 'absolute', top: -5, right: -5, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, lineHeight: 1 },
}

function NavItem({ to, label, active, icon, accent, badge }) {
  const c = accent ? colors.orange : active ? '#fff' : '#444'
  return (
    <Link to={to} style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '8px 4px',
      textDecoration: 'none',
      gap: 4,
      minHeight: 56,
      WebkitTapHighlightColor: 'transparent',
      color: c,
    }}>
      <div style={{
        position: 'relative',
        width: 38,
        height: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        background: active ? 'rgba(244,112,27,0.1)' : accent ? 'rgba(244,112,27,0.15)' : 'transparent',
        border: `1px solid ${(active || accent) ? 'rgba(244,112,27,0.2)' : 'transparent'}`,
      }}>
        {icon}
        {badge > 0 && <div style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900 }}>{badge}</div>}
      </div>
      <span style={{
        fontSize: '0.58rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        lineHeight: 1,
        color: accent ? colors.orange : active ? colors.orange : '#444',
      }}>
        {label}
      </span>
    </Link>
  )
}

function HomeIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/></svg>
}
function BallIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3c0 4.97 3 9 7 10.5M12 3c0 4.97-3 9-7 10.5"/><path d="M5.5 19.5C7 16 9 13 12 12s5-4 6.5-7.5"/></svg>
}
function ChartIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}
function PlusIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
}
function UserIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
}
function ImportIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
}
function FeedIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
}
function SwordsIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="21" x2="9" y2="19"/></svg>
}
