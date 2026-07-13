import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { colors } from '../lib/theme'
import {
  IconBall, IconFlame, IconTarget, IconThree,
  IconPass, IconShield, IconReb, IconTrophy,
  IconArrow, IconStar
} from '../lib/icons'

export default function Landing() {
  const { isEditor } = useAuth()
  const [leaders, setLeaders] = useState(null)
  const [recentSeries, setRecentSeries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      const [{ data: careers }, { data: series }, { data: mvps }] = await Promise.all([
        supabase.from('career_player_totals').select('*'),
        supabase.from('series').select('*').eq('status', 'complete').order('ended_at', { ascending: false }).limit(3),
        supabase.from('series_rankings').select('*, players(gamertag, display_name)').eq('is_mvp', true),
      ])

      if (careers && careers.length > 0) {
        const withGP = careers.filter(p => p.total_gp >= 3)
        const withFG = careers.filter(p => p.career_fga >= 10)
        const withThree = careers.filter(p => p.career_tpa >= 5)

        setLeaders({
          scorer: maxBy(withGP, 'career_ppg'),
          shooter: maxBy(withFG, 'career_fg_pct'),
          threePoint: maxBy(withThree, 'career_3p_pct'),
          playmaker: maxBy(withGP, 'career_apg'),
          rebounder: maxBy(withGP, 'career_rpg'),
          lockdown: maxBy(withGP, 'career_spg'),
          mvpLeader: maxBy(careers, 'mvp_count'),
          eliteLeader: maxBy(careers, 'elite_count'),
          // Hall of shame
          worstShooter: withFG.length ? withFG.reduce((w, c) => Number(c.career_fg_pct) < Number(w.career_fg_pct) ? c : w, withFG[0]) : null,
          mostTov: maxBy(withGP, 'career_tovpg'),
          gTierLeader: maxBy(careers, 'g_tier_count'),
        })
      }
      setRecentSeries(series || [])
      setLoading(false)
    }
    fetchStats()
  }, [])

  return (
    <div style={p.page}>
      {/* NAV */}
      <nav style={p.nav}>
        <div style={p.navInner}>
          <Link to="/" style={p.logo}>
            <IconBall size={18} color={colors.orange} />
            <span>NEXT STEP SERIES</span>
          </Link>
          <div style={p.navLinks}>
            <Link to="/leagues" style={p.navLink}>Series</Link>
            <Link to="/history" style={p.navLink}>History</Link>
            {isEditor
              ? <Link to="/series/new" style={p.navCta}>+ New Series</Link>
              : <Link to="/login" style={p.navCta}>Sign In</Link>
            }
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={p.hero}>
        <div style={p.heroBg} />
        <div style={p.heroInner}>
          <div style={p.heroEyebrow}>
            <IconBall size={13} color={colors.orange} />
            <span>NBA 2K26 · PRO-AM TRACKER</span>
          </div>
          <h1 style={p.heroH1}>
            Run the series.<br />
            <span style={p.heroOrange}>Own the stats.</span>
          </h1>
          <p style={p.heroP}>
            Drop a box score. Get instant tier rankings, career history, and a shareable chart — built for crews that take the game seriously.
          </p>
          <div style={p.heroButtons}>
            <Link to="/leagues" style={p.btnOrange}>
              View Series <IconArrow size={14} color="#fff" />
            </Link>
            {isEditor && (
              <Link to="/series/new" style={p.btnOutline}>New Series</Link>
            )}
          </div>
        </div>
      </section>

      {/* SUPERLATIVES DASHBOARD */}
      <section style={p.section}>
        <div style={p.sectionInner}>
          <div style={p.sectionHeader}>
            <div style={p.sectionEye}>
              <IconFlame size={13} color={colors.orange} />
              <span>LEAGUE LEADERS</span>
            </div>
            <h2 style={p.sectionH2}>Who's Running the League</h2>
          </div>

          {loading ? (
            <div style={p.loadingGrid}>
              {[...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)}
            </div>
          ) : !leaders ? (
            <div style={p.emptyStats}>
              <IconBall size={32} color={colors.border} />
              <p style={p.emptyText}>Stats populate here once series are logged.</p>
              {isEditor && <Link to="/series/new" style={p.btnOrange}>Start First Series</Link>}
            </div>
          ) : (
            <div style={p.statGrid}>
              <StatCard
                icon={<IconFlame size={20} color={colors.orange} />}
                label="Top Scorer"
                accent={colors.orange}
                player={leaders.scorer}
                stat={`${leaders.scorer?.career_ppg} PPG`}
                sub="Career scoring average"
              />
              <StatCard
                icon={<IconTarget size={20} color={colors.statGreen} />}
                label="Most Efficient"
                accent={colors.statGreen}
                player={leaders.shooter}
                stat={`${leaders.shooter?.career_fg_pct}% FG`}
                sub="Best field goal percentage"
              />
              <StatCard
                icon={<IconThree size={20} color={colors.gold} />}
                label="Best from Three"
                accent={colors.gold}
                player={leaders.threePoint}
                stat={`${leaders.threePoint?.career_3p_pct}% 3P`}
                sub="Best three-point percentage"
              />
              <StatCard
                icon={<IconPass size={20} color={colors.blue} />}
                label="Top Playmaker"
                accent={colors.blue}
                player={leaders.playmaker}
                stat={`${leaders.playmaker?.career_apg} APG`}
                sub="Career assists per game"
              />
              <StatCard
                icon={<IconReb size={20} color="#8b5cf6" />}
                label="Glass Cleaner"
                accent="#8b5cf6"
                player={leaders.rebounder}
                stat={`${leaders.rebounder?.career_rpg} RPG`}
                sub="Career rebounds per game"
              />
              <StatCard
                icon={<IconShield size={20} color="#06b6d4" />}
                label="Lockdown"
                accent="#06b6d4"
                player={leaders.lockdown}
                stat={`${leaders.lockdown?.career_spg} SPG`}
                sub="Steals per game"
              />
              <StatCard
                icon={<IconTrophy size={20} color={colors.gold} />}
                label="MVP Count"
                accent={colors.gold}
                player={leaders.mvpLeader}
                stat={`${leaders.mvpLeader?.mvp_count} MVP${leaders.mvpLeader?.mvp_count !== 1 ? 's' : ''}`}
                sub="Series MVP awards"
              />
              <StatCard
                icon={<IconStar size={20} color={colors.elite} filled />}
                label="Most ELITE Finishes"
                accent={colors.elite}
                player={leaders.eliteLeader}
                stat={`${leaders.eliteLeader?.elite_count}× ELITE`}
                sub="Elite tier appearances"
              />
            </div>
          )}
        </div>
      </section>

      {/* HALL OF SHAME */}
      {leaders && (leaders.worstShooter || leaders.mostTov || leaders.gTierLeader) && (
        <section style={{...p.section, background: '#050000'}}>
          <div style={p.sectionInner}>
            <div style={p.sectionHeader}>
              <div style={{...p.sectionEye, color: colors.gTier}}>
                <IconFlame size={13} color={colors.gTier} />
                <span>BOTTOM OF THE LOBBY</span>
              </div>
              <h2 style={p.sectionH2}>Who's Getting Exposed</h2>
            </div>
            <div style={p.statGrid}>
              {leaders.gTierLeader && leaders.gTierLeader.g_tier_count > 0 && (
                <StatCard
                  icon={<IconFlame size={20} color={colors.gTier} />}
                  label="Most G Tier Finishes"
                  accent={colors.gTier}
                  player={leaders.gTierLeader}
                  stat={`${leaders.gTierLeader.g_tier_count}× G TIER`}
                  sub="Series finished in G Tier"
                />
              )}
              {leaders.worstShooter && (
                <StatCard
                  icon={<IconTarget size={20} color={colors.gTier} />}
                  label="Worst Shooter"
                  accent={colors.gTier}
                  player={leaders.worstShooter}
                  stat={`${leaders.worstShooter.career_fg_pct}% FG`}
                  sub="Lowest career field goal %"
                />
              )}
              {leaders.mostTov && (
                <StatCard
                  icon={<IconPass size={20} color={colors.gTier} />}
                  label="Turnover Machine"
                  accent={colors.gTier}
                  player={leaders.mostTov}
                  stat={`${leaders.mostTov.career_tovpg} TOV/G`}
                  sub="Most turnovers per game"
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* RECENT SERIES */}
      {recentSeries.length > 0 && (
        <section style={{...p.section, background: '#000'}}>
          <div style={p.sectionInner}>
            <div style={p.sectionHeader}>
              <div style={p.sectionEye}>
                <IconBall size={13} color={colors.orange} />
                <span>RECENT ACTION</span>
              </div>
              <h2 style={p.sectionH2}>Latest Series</h2>
            </div>
            <div style={p.recentGrid}>
              {recentSeries.map(s => {
                const win = s.our_wins > s.opp_wins
                return (
                  <Link key={s.id} to={`/series/${s.id}`} style={p.recentCard}>
                    <div style={{...p.recentBar, background: win ? colors.statGreen : colors.statRed}} />
                    <div style={p.recentContent}>
                      <div style={p.recentName}>{s.name}</div>
                      <div style={p.recentMatchup}>{s.our_team_name} vs {s.opp_team_name}</div>
                      {s.storyline && <div style={p.recentStory}>{s.storyline}</div>}
                      <div style={p.recentBottom}>
                        <span style={p.recentScore}>{s.our_wins}–{s.opp_wins}</span>
                        <span style={{...p.recentResult, color: win ? colors.statGreen : colors.statRed}}>
                          {s.result_label || (win ? 'W' : 'L')}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
            <div style={p.allLink}>
              <Link to="/leagues" style={p.allLinkA}>
                View all series <IconArrow size={13} color={colors.orange} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* HOW IT WORKS */}
      <section style={{...p.section, background: '#050505'}}>
        <div style={p.sectionInner}>
          <div style={p.sectionHeader}>
            <div style={p.sectionEye}>
              <IconBall size={13} color={colors.orange} />
              <span>HOW IT WORKS</span>
            </div>
            <h2 style={p.sectionH2}>From Screenshot to Rankings</h2>
          </div>
          <div style={p.stepsGrid}>
            {[
              { n: '01', title: 'Drop the Box Score', desc: 'Screenshot your 2K box score and drag it in. AI reads every stat automatically.' },
              { n: '02', title: 'Verify & Save', desc: 'Confirm the parsed stats. Team totals must reconcile before anything saves.' },
              { n: '03', title: 'Log Your Matchup', desc: 'Each player logs who they guarded. Rankings factor in defensive assignment difficulty.' },
              { n: '04', title: 'Get the Rankings', desc: 'Impact-weighted tier list — ELITE down to G TIER — generated every series.' },
            ].map(step => (
              <div key={step.n} style={p.step}>
                <div style={p.stepN}>{step.n}</div>
                <h3 style={p.stepTitle}>{step.title}</h3>
                <p style={p.stepDesc}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={p.footer}>
        <div style={p.footerInner}>
          <div style={p.footerLogo}>
            <IconBall size={15} color={colors.orange} />
            <span>NEXT STEP SERIES</span>
          </div>
          <span style={p.footerSub}>NBA 2K26 Pro-Am Stat Tracker</span>
        </div>
      </footer>
    </div>
  )
}

function StatCard({ icon, label, accent, player, stat, sub }) {
  if (!player) return <StatCardSkeleton label={label} />
  const name = player.display_name || player.gamertag
  return (
    <Link to={`/leagues`} style={{...c.card, '--accent': accent}}>
      <div style={{...c.cardTop, borderLeftColor: accent}}>
        <div style={c.cardIcon}>{icon}</div>
        <div style={{...c.cardLabel, color: accent}}>{label}</div>
      </div>
      <div style={c.cardPlayer}>{name}</div>
      <div style={{...c.cardStat, color: accent}}>{stat}</div>
      <div style={c.cardSub}>{sub}</div>
    </Link>
  )
}

function StatCardSkeleton({ label } = {}) {
  return (
    <div style={c.skeleton}>
      <div style={c.skeletonBar} />
      <div style={{...c.skeletonLine, width: '60%'}} />
      <div style={{...c.skeletonLine, width: '40%', height: 24, marginTop: 8}} />
    </div>
  )
}

function maxBy(arr, key) {
  if (!arr || arr.length === 0) return null
  return arr.reduce((best, cur) => (Number(cur[key] || 0) > Number(best[key] || 0) ? cur : best), arr[0])
}

// ── Styles ─────────────────────────────────────────────────────────────────

const p = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'Segoe UI', system-ui, sans-serif" },

  nav: { position: 'sticky', top: 0, zIndex: 200, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #111' },
  navInner: { maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.16em', color: '#fff' },
  navLinks: { display: 'flex', alignItems: 'center', gap: '0.25rem' },
  navLink: { color: '#666', textDecoration: 'none', fontSize: '0.85rem', padding: '0.4rem 0.75rem', borderRadius: 6 },
  navCta: { background: colors.orange, color: '#fff', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, padding: '0.45rem 1rem', borderRadius: 6, marginLeft: '0.5rem' },

  hero: { position: 'relative', overflow: 'hidden', borderBottom: '1px solid #111' },
  heroBg: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(ellipse 80% 60% at 20% 50%, rgba(244,112,27,0.08) 0%, transparent 70%), radial-gradient(ellipse 50% 80% at 80% 20%, rgba(29,110,245,0.06) 0%, transparent 70%)',
  },
  heroInner: { position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '6rem 1.5rem 5rem' },
  heroEyebrow: { display: 'flex', alignItems: 'center', gap: 6, color: colors.orange, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '1.25rem' },
  heroH1: { fontSize: 'clamp(2.4rem, 6vw, 4rem)', fontWeight: 900, lineHeight: 1.06, margin: '0 0 1.25rem', letterSpacing: '-0.025em', color: '#fff' },
  heroOrange: { color: colors.orange },
  heroP: { color: '#777', fontSize: 'clamp(0.95rem, 2vw, 1.1rem)', lineHeight: 1.7, maxWidth: 520, margin: '0 0 2.5rem' },
  heroButtons: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' },
  btnOrange: { display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.orange, color: '#fff', textDecoration: 'none', padding: '0.75rem 1.5rem', borderRadius: 8, fontSize: '0.95rem', fontWeight: 700 },
  btnOutline: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#aaa', textDecoration: 'none', padding: '0.75rem 1.5rem', borderRadius: 8, fontSize: '0.95rem', fontWeight: 600, border: '1px solid #222' },

  section: { background: '#050505', borderBottom: '1px solid #0f0f0f' },
  sectionInner: { maxWidth: 1200, margin: '0 auto', padding: '4rem 1.5rem' },
  sectionHeader: { marginBottom: '2.5rem' },
  sectionEye: { display: 'flex', alignItems: 'center', gap: 6, color: colors.orange, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.6rem' },
  sectionH2: { fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 800, margin: 0, color: '#fff', letterSpacing: '-0.01em' },

  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1, background: '#111', border: '1px solid #111', borderRadius: 12, overflow: 'hidden' },
  loadingGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1, background: '#111', border: '1px solid #111', borderRadius: 12, overflow: 'hidden' },
  emptyStats: { textAlign: 'center', padding: '4rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' },
  emptyText: { color: '#444', fontSize: '0.9rem', margin: 0 },

  recentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' },
  recentCard: { display: 'flex', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 10, overflow: 'hidden', textDecoration: 'none', color: 'inherit' },
  recentBar: { width: 4, flexShrink: 0 },
  recentContent: { padding: '1rem 1.25rem', flex: 1 },
  recentName: { fontWeight: 700, fontSize: '0.95rem', color: '#fff', marginBottom: '0.2rem' },
  recentMatchup: { color: '#444', fontSize: '0.75rem', marginBottom: '0.5rem' },
  recentStory: { color: '#666', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: '0.75rem', fontStyle: 'italic' },
  recentBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  recentScore: { fontWeight: 800, fontSize: '1.2rem', color: '#fff' },
  recentResult: { fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.08em' },
  allLink: { marginTop: '1.5rem', textAlign: 'right' },
  allLinkA: { display: 'inline-flex', alignItems: 'center', gap: 5, color: colors.orange, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 },

  stepsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '2rem' },
  step: {},
  stepN: { fontSize: '2.5rem', fontWeight: 900, color: '#1a1a1a', lineHeight: 1, marginBottom: '0.75rem', fontVariantNumeric: 'tabular-nums' },
  stepTitle: { fontWeight: 800, fontSize: '1rem', color: '#fff', margin: '0 0 0.5rem' },
  stepDesc: { color: '#555', fontSize: '0.85rem', lineHeight: 1.65, margin: 0 },

  footer: { borderTop: '1px solid #0f0f0f', background: '#000' },
  footerInner: { maxWidth: 1200, margin: '0 auto', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' },
  footerLogo: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.15em', color: '#333' },
  footerSub: { color: '#2a2a2a', fontSize: '0.75rem' },
}

const c = {
  card: { display: 'block', background: '#000', padding: '1.25rem 1.5rem', textDecoration: 'none', color: 'inherit', borderLeft: '3px solid transparent', transition: 'background 0.15s' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem', borderLeft: '0px' },
  cardIcon: { opacity: 0.9 },
  cardLabel: { fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' },
  cardPlayer: { fontWeight: 800, fontSize: '1.05rem', color: '#fff', marginBottom: '0.3rem' },
  cardStat: { fontWeight: 900, fontSize: '1.5rem', lineHeight: 1, marginBottom: '0.3rem', letterSpacing: '-0.02em' },
  cardSub: { color: '#444', fontSize: '0.75rem' },
  skeleton: { background: '#000', padding: '1.25rem 1.5rem', borderLeft: '3px solid #111' },
  skeletonBar: { height: 12, background: '#111', borderRadius: 4, marginBottom: 12, width: '45%' },
  skeletonLine: { height: 16, background: '#0d0d0d', borderRadius: 4, marginBottom: 6 },
}
