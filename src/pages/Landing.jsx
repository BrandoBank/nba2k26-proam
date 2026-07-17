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
  const [hotStreaks, setHotStreaks] = useState([])
  const [clutchLeaders, setClutchLeaders] = useState([])
  const [consistencyData, setConsistencyData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      const [{ data: careers }, { data: series }, { data: rankings }, { data: clutch }, { data: consistency }] = await Promise.all([
        supabase.from('career_player_totals').select('*'),
        supabase.from('series').select('*').eq('status', 'complete').order('ended_at', { ascending: false }).limit(3),
        supabase.from('series_rankings').select('*, players(gamertag,display_name), series(name,ended_at)').eq('finalized', true).order('series(ended_at)', { ascending: true }),
        supabase.from('clutch_game_stats').select('*').order('clutch_ppg', { ascending: false }).limit(5),
        supabase.from('player_consistency').select('*').order('consistency_score', { ascending: false }).limit(10),
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
      setClutchLeaders(clutch || [])
      setConsistencyData(consistency || [])

      // Compute hot streaks: consecutive ELITE finishes per player
      if (rankings && rankings.length > 0) {
        const byPlayer = {}
        rankings.forEach(r => {
          const gtag = r.players?.gamertag
          if (!gtag) return
          if (!byPlayer[gtag]) byPlayer[gtag] = { gamertag: gtag, display_name: r.players?.display_name, streaks: [] }
          byPlayer[gtag].streaks.push(r.tier)
        })
        const streaks = Object.values(byPlayer).map(p => {
          let cur = 0, max = 0
          p.streaks.forEach(t => { if (t === 'ELITE') { cur++; max = Math.max(max, cur) } else cur = 0 })
          return { ...p, currentStreak: cur, maxStreak: max }
        }).filter(p => p.maxStreak >= 2).sort((a, b) => b.currentStreak - a.currentStreak || b.maxStreak - a.maxStreak)
        setHotStreaks(streaks.slice(0, 4))
      }
      setLoading(false)
    }
    fetchStats()
  }, [])

  return (
    <div style={p.page}>
      {/* NAV */}
      <nav style={p.nav} className="desktop-nav">
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

      {/* 2K27 COUNTDOWN */}
      <Countdown2K27 />

      {/* HERO + LEADERBOARD */}
      <section style={p.hero}>
        <div style={p.heroBg} />
        <div style={p.heroInner} className="hero-inner">
          <div style={p.heroLeft}>
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
          <div style={p.heroRight} className="hero-right">
            <AllTimeLeaderboard />
          </div>
        </div>
      </section>

      {/* LEADERBOARD (mobile only — desktop sees it in hero column) */}
      <section style={{...p.section, background: '#000'}} className="leaderboard-mobile-section">
        <div style={p.sectionInner}>
          <AllTimeLeaderboard />
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

      {/* HOT STREAKS */}
      <section style={{...p.section, background: '#000'}}>
        <div style={p.sectionInner}>
          <div style={p.sectionHeader}>
            <div style={{...p.sectionEye, color: colors.orange}}><IconFlame size={13} color={colors.orange} /><span>HOT STREAKS</span></div>
            <h2 style={p.sectionH2}>Consecutive ELITE Finishes</h2>
            <p style={p.sectionDesc}>Who's locked in. Back-to-back ELITE series means you're running the league — not just having one good night.</p>
          </div>
          {hotStreaks.length === 0 ? (
            <CompetitiveEmpty label="Hot streak data populates after 2+ completed series with finalized rankings." />
          ) : (
            <div style={p.streakGrid}>
              {hotStreaks.map((pl, i) => (
                <div key={pl.gamertag} style={p.streakCard}>
                  <div style={{...p.streakRank, color: i === 0 ? colors.orange : '#444'}}>#{i+1}</div>
                  <div style={p.streakName}>{pl.display_name || pl.gamertag}</div>
                  <div style={p.streakBadge}>
                    <span style={{color: colors.elite, fontWeight: 900, fontSize: '1.3rem'}}>{pl.currentStreak}</span>
                    <span style={{color: '#444', fontSize: '0.72rem', marginLeft: 4}}>consecutive ELITE</span>
                  </div>
                  {pl.maxStreak > pl.currentStreak && <div style={p.streakMax}>Career best: {pl.maxStreak} in a row</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CLUTCH + CONSISTENCY */}
      <section style={{...p.section, background: '#050505'}}>
        <div style={p.sectionInner}>
          <div style={p.twoCol}>
            <div style={p.twoColHalf}>
              <div style={p.sectionHeader}>
                <div style={{...p.sectionEye, color: '#f59e0b'}}><IconFlame size={13} color="#f59e0b" /><span>CLUTCH GENE</span></div>
                <h2 style={{...p.sectionH2, fontSize: '1.3rem'}}>When It Matters Most</h2>
                <p style={p.sectionDesc}>Performance in deciding games (G5, G6, G7). This is where legacies are made or exposed.</p>
              </div>
              {clutchLeaders.length === 0 ? (
                <CompetitiveEmpty label="Clutch stats unlock after series go to G5+." />
              ) : (
                <div style={p.listCard}>
                  {clutchLeaders.slice(0,5).map((pl, i) => (
                    <div key={pl.gamertag} style={p.listRow}>
                      <span style={{color: '#333', fontSize: '0.75rem', minWidth: 18}}>#{i+1}</span>
                      <span style={p.listName}>{pl.gamertag}</span>
                      <span style={{color: '#f59e0b', fontWeight: 700, fontSize: '0.88rem'}}>{pl.clutch_ppg} PPG</span>
                      <span style={{color: '#444', fontSize: '0.75rem'}}>{pl.clutch_fg_pct ? `${pl.clutch_fg_pct}% FG` : ''}</span>
                      <span style={{color: '#333', fontSize: '0.72rem'}}>{pl.clutch_wins}W</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={p.twoColHalf}>
              <div style={p.sectionHeader}>
                <div style={{...p.sectionEye, color: '#06b6d4'}}><IconTarget size={13} color="#06b6d4" /><span>CONSISTENCY</span></div>
                <h2 style={{...p.sectionH2, fontSize: '1.3rem'}}>Show Up Every Night</h2>
                <p style={p.sectionDesc}>Who delivers the same output regardless of matchup or game situation. High variance = unreliable.</p>
              </div>
              {consistencyData.length === 0 ? (
                <CompetitiveEmpty label="Consistency scores need 2+ games in a series." />
              ) : (
                <div style={p.listCard}>
                  {consistencyData.slice(0,5).map((pl, i) => (
                    <div key={`${pl.gamertag}-${pl.series_id}`} style={p.listRow}>
                      <span style={{color: '#333', fontSize: '0.75rem', minWidth: 18}}>#{i+1}</span>
                      <span style={p.listName}>{pl.gamertag}</span>
                      <span style={{color: '#06b6d4', fontWeight: 700, fontSize: '0.88rem'}}>{pl.consistency_score}%</span>
                      <span style={{color: '#444', fontSize: '0.75rem'}}>{pl.ppg} PPG avg</span>
                      <span style={{color: '#333', fontSize: '0.72rem'}}>±{pl.pts_stddev}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* COMPETITIVE FEATURES EXPLAINER */}
      <section style={{...p.section, background: '#000', borderBottom: '1px solid #0f0f0f'}}>
        <div style={p.sectionInner}>
          <div style={p.sectionHeader}>
            <div style={p.sectionEye}><IconTrophy size={13} color={colors.orange} /><span>COMPETITIVE FEATURES</span></div>
            <h2 style={p.sectionH2}>Built for the Serious Ones</h2>
          </div>
          <div style={p.featureGrid}>
            {[
              { label: 'Hot Streak', color: colors.orange, desc: 'Back-to-back ELITE finishes tracked across every series. Who\'s on a run right now.' },
              { label: 'Rival Record', color: colors.blue, desc: 'Head-to-head W/L when specific players are on opposite sides. Who owns who.' },
              { label: 'Clutch Gene', color: '#f59e0b', desc: 'G5/G6/G7 performance only. Separate stats for when the series is on the line.' },
              { label: 'Consistency Badge', color: '#06b6d4', desc: 'Standard deviation of your output. High variance means you\'re unreliable. Low = locked in.' },
              { label: 'Pretender Flag', color: colors.gTier, desc: 'SOLID or lower on the winning team. Your ring doesn\'t mean you earned it.' },
              { label: 'Series Predictions', color: colors.gold, desc: 'Before each series, pick the winner, MVP, and length. Track who calls it right.' },
              { label: 'Per-Game MVP', color: colors.elite, desc: 'Auto-awarded after every game. Separate from series MVP — shows who peaked.' },
              { label: 'Achievement Badges', color: colors.statGreen, desc: '50% Club, MVP Dynasty, Iron Man, G Tier Regular and more. Milestone tracking.' },
            ].map(f => (
              <div key={f.label} style={p.featureItem}>
                <div style={{...p.featureDot, background: f.color}} />
                <div>
                  <div style={{...p.featureLabel, color: f.color}}>{f.label}</div>
                  <div style={p.featureDesc}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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

function Countdown2K27() {
  const RELEASE = new Date('2026-09-04T00:00:00')
  const EARLY_ACCESS = new Date('2026-08-28T00:00:00')
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const target = now < EARLY_ACCESS ? EARLY_ACCESS : RELEASE
  const isEarlyAccess = now < EARLY_ACCESS
  const diff = Math.max(0, target - now)
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)

  if (diff === 0) return null

  return (
    <div style={cd.bar}>
      <div style={cd.inner}>
        <div style={cd.label}>
          <span style={cd.badge}>2K27</span>
          <span style={cd.text}>{isEarlyAccess ? 'Early Access' : 'Release'} drops Sep {isEarlyAccess ? '28' : '4'} — finish your 2K26 business</span>
        </div>
        <div style={cd.units}>
          <Unit n={days} label="days" />
          <div style={cd.sep}>:</div>
          <Unit n={hours} label="hrs" />
          <div style={cd.sep}>:</div>
          <Unit n={mins} label="min" />
          <div style={cd.sep}>:</div>
          <Unit n={secs} label="sec" />
        </div>
      </div>
    </div>
  )
}

function Unit({ n, label }) {
  return (
    <div style={cd.unit}>
      <span style={cd.unitN}>{String(n).padStart(2, '0')}</span>
      <span style={cd.unitL}>{label}</span>
    </div>
  )
}

const cd = {
  bar: { background: '#0a0500', borderBottom: '1px solid #1a1000' },
  inner: { maxWidth: 1200, margin: '0 auto', padding: '0.6rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' },
  label: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  badge: { background: colors.orange, color: '#fff', fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.1em', padding: '0.15rem 0.5rem', borderRadius: 3 },
  text: { color: '#555', fontSize: '0.78rem' },
  units: { display: 'flex', alignItems: 'center', gap: '0.25rem' },
  unit: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 },
  unitN: { color: colors.orange, fontWeight: 900, fontSize: '1.1rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  unitL: { color: '#333', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.08em' },
  sep: { color: '#333', fontWeight: 700, fontSize: '1rem', marginBottom: 8 },
}

const LB_STATS = [
  { key: 'career_ppg', label: 'PPG', color: colors.orange },
  { key: 'career_fg_pct', label: 'FG%', color: colors.statGreen, suffix: '%' },
  { key: 'career_3p_pct', label: '3P%', color: colors.gold, suffix: '%' },
  { key: 'career_apg', label: 'APG', color: colors.blue },
  { key: 'career_rpg', label: 'RPG', color: '#8b5cf6' },
  { key: 'career_spg', label: 'SPG', color: '#06b6d4' },
  { key: 'elite_count', label: 'ELITE', color: colors.elite },
  { key: 'mvp_count', label: 'MVPs', color: colors.gold },
  { key: 'g_tier_count', label: 'G TIER', color: colors.gTier },
]

function AllTimeLeaderboard() {
  const [careers, setCareers] = useState([])
  const [tab, setTab] = useState('career_ppg')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('career_player_totals').select('*').then(({ data }) => {
      setCareers(data || [])
      setLoading(false)
    })
    // Refresh every 2 mins
    const t = setInterval(() => {
      supabase.from('career_player_totals').select('*').then(({ data }) => { if (data) setCareers(data) })
    }, 120000)
    return () => clearInterval(t)
  }, [])

  const stat = LB_STATS.find(s => s.key === tab) || LB_STATS[0]
  const minGP = ['career_fg_pct', 'career_3p_pct'].includes(tab) ? 0 : 3
  const ranked = [...careers]
    .filter(p => p.total_gp >= minGP && p[tab] != null && Number(p[tab]) > 0)
    .sort((a, b) => Number(b[tab]) - Number(a[tab]))
    .slice(0, 10)

  return (
    <div style={lb.wrap}>
      <div style={lb.header}>
        <div style={lb.eye}><IconTrophy size={11} color={colors.orange} /><span>ALL-TIME LEADERBOARD</span></div>
        <Link to="/history" style={lb.histLink}>Full history →</Link>
      </div>
      <div style={lb.tabs}>
        {LB_STATS.map(s => (
          <button key={s.key} onClick={() => setTab(s.key)}
            style={{...lb.tab, borderBottomColor: tab === s.key ? s.color : 'transparent', color: tab === s.key ? s.color : '#444'}}>
            {s.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div style={lb.empty}>Loading...</div>
      ) : ranked.length === 0 ? (
        <div style={lb.empty}>No data yet — stats populate as series are logged.</div>
      ) : (
        <div style={lb.list}>
          {ranked.map((p, i) => {
            const val = Number(p[tab])
            const max = Number(ranked[0][tab])
            const barPct = max > 0 ? (val / max) * 100 : 0
            const name = p.display_name || p.gamertag
            return (
              <div key={p.player_id} style={lb.row}>
                <div style={{...lb.rank, color: i === 0 ? colors.gold : i === 1 ? '#aaa' : i === 2 ? '#cd7f32' : '#333'}}>
                  {i + 1}
                </div>
                <div style={lb.info}>
                  <div style={lb.nameRow}>
                    <span style={lb.name}>{name}</span>
                    <span style={{...lb.val, color: stat.color}}>
                      {val % 1 === 0 ? val : val.toFixed(1)}{stat.suffix || ''}
                    </span>
                  </div>
                  <div style={lb.barTrack}>
                    <div style={{...lb.barFill, width: `${barPct}%`, background: stat.color}} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const lb = {
  wrap: { background: 'rgba(5,5,5,0.9)', border: '1px solid #1a1a1a', borderRadius: 12, padding: '1.25rem', backdropFilter: 'blur(10px)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  eye: { display: 'flex', alignItems: 'center', gap: 5, color: colors.orange, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' },
  histLink: { color: '#333', fontSize: '0.72rem', textDecoration: 'none' },
  tabs: { display: 'flex', flexWrap: 'wrap', gap: '0.15rem', marginBottom: '1rem', borderBottom: '1px solid #111', paddingBottom: '0.5rem' },
  tab: { background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#444', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', padding: '0.25rem 0.4rem', cursor: 'pointer', fontFamily: 'inherit' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  row: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  rank: { fontSize: '0.75rem', fontWeight: 900, minWidth: 16, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  info: { flex: 1 },
  nameRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.2rem' },
  name: { color: '#ccc', fontSize: '0.82rem', fontWeight: 600 },
  val: { fontWeight: 800, fontSize: '0.88rem', fontVariantNumeric: 'tabular-nums' },
  barTrack: { height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, transition: 'width 0.4s ease' },
  empty: { color: '#333', fontSize: '0.8rem', textAlign: 'center', padding: '2rem 0', fontStyle: 'italic' },
}

function CompetitiveEmpty({ label }) {
  return (
    <div style={{ padding: '1.5rem', background: '#080808', border: '1px solid #111', borderRadius: 8, color: '#333', fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center' }}>
      {label}
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
  heroInner: { position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '5rem 1.5rem 4rem', display: 'grid', gridTemplateColumns: '1fr minmax(0, 380px)', gap: '3rem', alignItems: 'center' },
  heroLeft: {},
  heroRight: { alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  heroEyebrow: { display: 'flex', alignItems: 'center', gap: 6, color: colors.orange, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '1.25rem' },
  heroH1: { fontSize: 'clamp(2rem, 4vw, 3.2rem)', fontWeight: 900, lineHeight: 1.06, margin: '0 0 1.25rem', letterSpacing: '-0.025em', color: '#fff' },
  heroOrange: { color: colors.orange },
  heroP: { color: '#777', fontSize: 'clamp(0.9rem, 1.5vw, 1rem)', lineHeight: 1.7, maxWidth: 480, margin: '0 0 2rem' },
  heroButtons: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' },
  btnOrange: { display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.orange, color: '#fff', textDecoration: 'none', padding: '0.75rem 1.5rem', borderRadius: 8, fontSize: '0.95rem', fontWeight: 700 },
  btnOutline: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#aaa', textDecoration: 'none', padding: '0.75rem 1.5rem', borderRadius: 8, fontSize: '0.95rem', fontWeight: 600, border: '1px solid #222' },

  section: { background: '#050505', borderBottom: '1px solid #0f0f0f' },
  sectionInner: { maxWidth: 1200, margin: '0 auto', padding: '4rem 1.5rem' },
  sectionHeader: { marginBottom: '2.5rem' },
  sectionEye: { display: 'flex', alignItems: 'center', gap: 6, color: colors.orange, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.6rem' },
  sectionH2: { fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 800, margin: 0, color: '#fff', letterSpacing: '-0.01em' },
  sectionDesc: { color: '#444', fontSize: '0.85rem', lineHeight: 1.65, margin: '0.75rem 0 0' },

  streakGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' },
  streakCard: { background: '#080808', border: '1px solid #111', borderRadius: 10, padding: '1.25rem' },
  streakRank: { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.4rem' },
  streakName: { fontWeight: 800, fontSize: '1rem', color: '#fff', marginBottom: '0.5rem' },
  streakBadge: { display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: '0.3rem' },
  streakMax: { color: '#333', fontSize: '0.72rem', marginTop: '0.4rem' },

  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '3rem' },
  twoColHalf: {},
  listCard: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  listRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: '#080808', border: '1px solid #111', borderRadius: 6 },
  listName: { flex: 1, fontWeight: 700, fontSize: '0.88rem', color: '#fff' },

  featureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' },
  featureItem: { display: 'flex', gap: '0.85rem', alignItems: 'flex-start', padding: '1rem', background: '#050505', border: '1px solid #111', borderRadius: 8 },
  featureDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5 },
  featureLabel: { fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' },
  featureDesc: { color: '#444', fontSize: '0.8rem', lineHeight: 1.6 },

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
