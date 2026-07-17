import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { colors } from '../lib/theme'
import './MobileNav.css'

export default function MobileNav() {
  const { pathname } = useLocation()
  const { isEditor } = useAuth()

  const active = (path) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const isSeriesActive = active('/leagues') || (pathname.startsWith('/series') && !pathname.startsWith('/series/new'))

  return (
    <nav className="mobile-nav">
      <NavItem to="/" label="Home" active={active('/')} icon={<HomeIcon />} />
      <NavItem to="/leagues" label="Series" active={isSeriesActive} icon={<BallIcon />} />
      <NavItem to="/history" label="History" active={active('/history')} icon={<ChartIcon />} />
      {isEditor
        ? <NavItem to="/series/new" label="+ New" active={active('/series/new')} icon={<PlusIcon />} accent />
        : <NavItem to="/login" label="Sign In" active={active('/login')} icon={<UserIcon />} />
      }
    </nav>
  )
}

function NavItem({ to, label, active, icon, accent }) {
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
