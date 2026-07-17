/**
 * Compact top header for inner pages on mobile.
 * Shows back button + page title. Hidden on desktop (pages use their own layout).
 */
import { Link } from 'react-router-dom'
import { colors } from '../lib/theme'

export default function PageHeader({ title, backTo = '/', backLabel }) {
  return (
    <div className="page-header-mobile">
      <Link to={backTo} style={s.back}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        {backLabel || 'Back'}
      </Link>
      {title && <div style={s.title}>{title}</div>}
    </div>
  )
}

const s = {
  back: { display: 'flex', alignItems: 'center', gap: 4, color: colors.orange, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 },
  title: { color: '#fff', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.04em', textAlign: 'center', flex: 1, paddingRight: 60 },
}
