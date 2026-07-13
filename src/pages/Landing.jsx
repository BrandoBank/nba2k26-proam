import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Landing() {
  const { isEditor } = useAuth()

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={s.nav}>
        <span style={s.logo}>NEXT STEP SERIES</span>
        <div style={s.navRight}>
          <Link to="/leagues" style={s.navLink}>Leagues</Link>
          <Link to="/history" style={s.navLink}>History</Link>
          {isEditor
            ? <Link to="/dashboard" style={s.navBtn}>Dashboard</Link>
            : <Link to="/login" style={s.navBtn}>Sign In</Link>
          }
        </div>
      </nav>

      {/* Hero */}
      <section style={s.hero}>
        <div style={s.heroGlow} />
        <div style={s.heroContent}>
          <div style={s.pill}>NBA 2K26 · PRO-AM</div>
          <h1 style={s.heroTitle}>
            Your League.<br />Your Stats.<br />
            <span style={s.heroAccent}>Your Legacy.</span>
          </h1>
          <p style={s.heroSub}>
            Drop a box score screenshot and get instant per-series averages,
            impact-weighted tier rankings, and a shareable chart — built for
            Pro-Am squads that take it seriously.
          </p>
          <div style={s.heroActions}>
            <Link to="/leagues" style={s.btnPrimary}>View Series →</Link>
            {isEditor && <Link to="/series/new" style={s.btnGhost}>+ New Series</Link>}
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section style={s.features}>
        <FeatureCard
          icon="📸"
          title="Drop the Screenshot"
          desc="Paste your box score screenshot. AI reads every stat, grade, and defensive matchup automatically. You confirm, we save."
        />
        <FeatureCard
          icon="📊"
          title="Real Impact Rankings"
          desc="Efficiency, playmaking, defense, turnovers — weighted together. Not just whoever scored the most. Tier list generated every series."
        />
        <FeatureCard
          icon="🛡️"
          title="Matchup Tracking"
          desc="Log who you guarded each game. Rankings factor in defensive assignment difficulty — a tough night on KingJ counts differently."
        />
        <FeatureCard
          icon="📈"
          title="Career History"
          desc="Every series tracked. Career averages, tier appearance counts, MVP totals, head-to-head records. Who's really the best in the league?"
        />
        <FeatureCard
          icon="🔗"
          title="Share Instantly"
          desc="Every completed series gets a public link. Send it to the group chat. No login needed to view."
        />
        <FeatureCard
          icon="✅"
          title="Accuracy First"
          desc="Team totals must reconcile before anything saves. Edit history is logged. Stats stay clean."
        />
      </section>

      {/* CTA */}
      <section style={s.cta}>
        <h2 style={s.ctaTitle}>Ready to run it back?</h2>
        <p style={s.ctaSub}>All series, all stats, all history — in one place.</p>
        <Link to="/leagues" style={s.btnPrimary}>See the Series</Link>
      </section>

      {/* Footer */}
      <footer style={s.footer}>
        <span style={s.footerLogo}>NEXT STEP SERIES</span>
        <span style={s.footerSub}>NBA 2K26 Pro-Am Stat Tracker</span>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={s.card}>
      <div style={s.cardIcon}>{icon}</div>
      <h3 style={s.cardTitle}>{title}</h3>
      <p style={s.cardDesc}>{desc}</p>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'Segoe UI', system-ui, sans-serif" },

  nav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1.25rem 2.5rem', borderBottom: '1px solid #111',
    position: 'sticky', top: 0, background: 'rgba(0,0,0,0.9)',
    backdropFilter: 'blur(12px)', zIndex: 100,
  },
  logo: { fontWeight: 800, fontSize: '1rem', letterSpacing: '0.18em', color: '#fff' },
  navRight: { display: 'flex', gap: '1.5rem', alignItems: 'center' },
  navLink: { color: '#666', textDecoration: 'none', fontSize: '0.88rem', letterSpacing: '0.05em', transition: 'color 0.15s' },
  navBtn: {
    background: '#1d6ef5', color: '#fff', textDecoration: 'none',
    padding: '0.45rem 1.1rem', borderRadius: 6, fontSize: '0.88rem', fontWeight: 600,
  },

  hero: {
    position: 'relative', overflow: 'hidden',
    padding: '7rem 2.5rem 6rem', maxWidth: 900, margin: '0 auto',
  },
  heroGlow: {
    position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
    width: 600, height: 400, borderRadius: '50%',
    background: 'radial-gradient(ellipse, rgba(29,110,245,0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  heroContent: { position: 'relative', zIndex: 1 },
  pill: {
    display: 'inline-block', background: '#0a1a30', border: '1px solid #1d6ef5',
    color: '#4da6ff', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em',
    padding: '0.3rem 0.9rem', borderRadius: 20, marginBottom: '1.5rem',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 'clamp(2.2rem, 6vw, 3.8rem)', fontWeight: 900,
    lineHeight: 1.08, margin: '0 0 1.25rem', color: '#fff',
    letterSpacing: '-0.02em',
  },
  heroAccent: { color: '#1d6ef5' },
  heroSub: {
    color: '#888', fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
    lineHeight: 1.7, maxWidth: 560, margin: '0 0 2.5rem',
  },
  heroActions: { display: 'flex', gap: '1rem', flexWrap: 'wrap' },

  btnPrimary: {
    background: '#1d6ef5', color: '#fff', textDecoration: 'none',
    padding: '0.8rem 1.8rem', borderRadius: 8, fontSize: '1rem', fontWeight: 700,
    display: 'inline-block',
  },
  btnGhost: {
    background: 'transparent', color: '#aaa', textDecoration: 'none',
    padding: '0.8rem 1.8rem', borderRadius: 8, fontSize: '1rem', fontWeight: 600,
    border: '1px solid #2a2a2a', display: 'inline-block',
  },

  features: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1px', background: '#111', borderTop: '1px solid #111', borderBottom: '1px solid #111',
    maxWidth: 1200, margin: '0 auto',
  },
  card: { background: '#000', padding: '2rem 2rem', transition: 'background 0.15s' },
  cardIcon: { fontSize: '1.6rem', marginBottom: '0.75rem' },
  cardTitle: { color: '#fff', fontWeight: 700, fontSize: '1rem', margin: '0 0 0.5rem', letterSpacing: '0.02em' },
  cardDesc: { color: '#666', fontSize: '0.88rem', lineHeight: 1.65, margin: 0 },

  cta: {
    textAlign: 'center', padding: '6rem 2rem',
    background: 'linear-gradient(180deg, #000 0%, #050a14 100%)',
  },
  ctaTitle: { fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 800, margin: '0 0 0.75rem', color: '#fff' },
  ctaSub: { color: '#666', fontSize: '1rem', margin: '0 0 2rem' },

  footer: {
    borderTop: '1px solid #111', padding: '1.5rem 2.5rem',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
  },
  footerLogo: { fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.15em', color: '#444' },
  footerSub: { color: '#333', fontSize: '0.78rem' },
}
