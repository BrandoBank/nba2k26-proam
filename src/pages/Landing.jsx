import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { colors } from '../lib/theme'
import { useNavigate } from 'react-router-dom'
import { IconBall, IconFlame, IconTrophy, IconShield, IconStar, IconSnowflake, IconChat, IconX, IconCheck } from '../lib/icons'

const RAINBOW = 'linear-gradient(90deg,#f87171,#fb923c,#facc15,#4ade80,#60a5fa,#a78bfa,#f472b6)'
const OR = colors.orange
const VICE = 'linear-gradient(135deg,#7c3aed,#db2777,#f97316)'
const NEON_P = '#a855f7'
const NEON_P_GLOW = 'rgba(168,85,247,0.18)'

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Landing() {
  const { isEditor, session, signOut, gamertag: authGamertag } = useAuth()
  const [activeSeries, setActiveSeries] = useState([])
  const [recentSeries, setRecentSeries] = useState([])
  const [careers, setCareers] = useState([])
  const [rankings, setRankings] = useState([])
  const [hotStreaks, setHotStreaks] = useState([])
  const [coldList, setColdList] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      const [
        { data: active },
        { data: recent },
        { data: career },
        { data: rnk },
        { data: cmts },
      ] = await Promise.all([
        supabase.from('series').select('*').eq('status', 'in_progress').order('started_at', { ascending: false }),
        supabase.from('series').select('*').eq('status', 'complete').order('ended_at', { ascending: false }).limit(3),
        supabase.from('career_player_totals').select('*'),
        supabase.from('series_rankings').select('*, players(gamertag,display_name), series(name,ended_at)').eq('finalized', true).order('series(ended_at)', { ascending: true }),
        supabase.from('comments').select('*').order('created_at', { ascending: false }).limit(30),
      ])

      setActiveSeries(active || [])
      setRecentSeries(recent || [])
      setCareers(career || [])
      setComments(cmts || [])

      // Hot streaks: consecutive ELITE finishes
      if (rnk?.length > 0) {
        const byPlayer = {}
        rnk.forEach(r => {
          const gtag = r.players?.gamertag
          if (!gtag) return
          if (!byPlayer[gtag]) byPlayer[gtag] = { gamertag: gtag, display_name: r.players?.display_name, tiers: [] }
          byPlayer[gtag].tiers.push(r.tier)
        })
        const streaks = Object.values(byPlayer).map(p => {
          let cur = 0, max = 0
          p.tiers.forEach(t => { if (t === 'ELITE') { cur++; max = Math.max(max, cur) } else cur = 0 })
          // Ice cold: last tier was G_TIER after being STRONG or ELITE
          const last = p.tiers[p.tiers.length - 1]
          const prev = p.tiers[p.tiers.length - 2]
          const iceCold = last === 'G_TIER' && (prev === 'STRONG' || prev === 'ELITE')
          return { ...p, currentStreak: cur, maxStreak: max, iceCold }
        })
        setHotStreaks(streaks.filter(p => p.currentStreak >= 2).sort((a, b) => b.currentStreak - a.currentStreak).slice(0, 4))
        setColdList(streaks.filter(p => p.iceCold).slice(0, 3))
      }
      setRankings(rnk || [])
      setLoading(false)
    }
    fetchAll()
  }, [])

  const leaders = computeLeaders(careers)

  return (
    <div style={s.page}>
      <style>{`@keyframes tickerScroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
      {/* ARCADE BACKGROUND */}
      <div style={s.arcadeBg} />

      {/* NAV */}
      <nav style={s.nav}>
        <Link to="/" style={s.logo}>
          <IconBall size={16} color={OR} />
          <span>NEXT UP</span>
        </Link>
        <div style={s.navRight}>
          {session ? (
            <div style={s.navProfile}>
              <div style={s.navAvatar}>
                {(authGamertag?.[0] || session.user.email?.[0] || 'U').toUpperCase()}
              </div>
              <span style={s.navProfileLabel}>
                {(authGamertag || session.user.email?.split('@')[0] || '').toUpperCase()}
              </span>
              <button onClick={signOut} style={s.navSignOut}>OUT</button>
            </div>
          ) : (
            <Link to="/login" style={s.navCta}>Sign In</Link>
          )}
        </div>
      </nav>

      {/* 2K27 COUNTDOWN */}
      <Countdown />

      {/* FEED TICKER */}
      {comments.length > 0 && <CommentTicker comments={comments} />}

      {/* ACTIVE SERIES */}
      {activeSeries.length > 0 && (
        <section style={s.activeSection}>
          <div style={s.sectionLabel}>
            <span style={s.pulse} />
            <span style={{color: '#ef4444', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.16em', textShadow: '0 0 8px #ef4444'}}>LIVE</span>
          </div>
          <div style={s.activeGrid}>
            {activeSeries.map(ser => <ActiveSeriesCard key={ser.id} series={ser} />)}
          </div>
        </section>
      )}

      {/* JUMBOTRON — ALL-TIME LEADERBOARD */}
      <Jumbotron careers={careers} />

      {/* CULTURE BADGES: HOT + COLD */}
      {(hotStreaks.length > 0 || coldList.length > 0) && (
        <section style={{...s.section, background: 'linear-gradient(135deg,#06000f,#0a0008)'}}>
          <div style={s.badgeRow}>
            {hotStreaks.length > 0 && (
              <div style={s.badgeGroup}>
                <div style={s.badgeLabel}><IconFlame size={12} color={OR} /><span>ON FIRE</span></div>
                {hotStreaks.map(p => (
                  <div key={p.gamertag} style={s.badgeCard}>
                    <span style={s.badgeName}>{p.display_name || p.gamertag}</span>
                    <span style={{color: OR, fontWeight: 800, fontSize: '0.8rem'}}>{p.currentStreak}× ELITE</span>
                    <IconFlame size={16} color={OR} />
                  </div>
                ))}
              </div>
            )}
            {coldList.length > 0 && (
              <div style={s.badgeGroup}>
                <div style={{...s.badgeLabel, color: '#60a5fa'}}><IconShield size={12} color="#60a5fa" /><span style={{color:'#60a5fa'}}>ICE COLD</span></div>
                {coldList.map(p => (
                  <div key={p.gamertag} style={s.badgeCard}>
                    <span style={s.badgeName}>{p.display_name || p.gamertag}</span>
                    <span style={{color: '#60a5fa', fontWeight: 800, fontSize: '0.8rem'}}>dropped to G TIER</span>
                    <IconSnowflake size={16} color="#60a5fa" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* LEAGUE LEADERS */}
      {leaders && (
        <section style={s.section}>
          <div style={s.sectionHead}>
            <span style={s.eyebrow}><IconTrophy size={11} color={OR} />LEAGUE LEADERS</span>
          </div>
          <div style={s.leadersGrid}>
            {[
              { label: 'Top Scorer', value: leaders.scorer ? `${leaders.scorer.career_ppg} PPG` : '—', name: leaders.scorer?.display_name || leaders.scorer?.gamertag, color: OR },
              { label: 'Best Shooter', value: leaders.shooter ? `${leaders.shooter.career_fg_pct}% FG` : '—', name: leaders.shooter?.display_name || leaders.shooter?.gamertag, color: colors.statGreen },
              { label: 'From Deep', value: leaders.threePoint ? `${leaders.threePoint.career_3p_pct}% 3P` : '—', name: leaders.threePoint?.display_name || leaders.threePoint?.gamertag, color: colors.gold },
              { label: 'Playmaker', value: leaders.playmaker ? `${leaders.playmaker.career_apg} APG` : '—', name: leaders.playmaker?.display_name || leaders.playmaker?.gamertag, color: '#60a5fa' },
              { label: 'Glass', value: leaders.rebounder ? `${leaders.rebounder.career_rpg} RPG` : '—', name: leaders.rebounder?.display_name || leaders.rebounder?.gamertag, color: '#a78bfa' },
              { label: 'Lockdown', value: leaders.lockdown ? `${leaders.lockdown.career_spg} SPG` : '—', name: leaders.lockdown?.display_name || leaders.lockdown?.gamertag, color: '#06b6d4' },
              { label: 'MVP', value: leaders.mvp ? `${leaders.mvp.mvp_count}×` : '—', name: leaders.mvp?.display_name || leaders.mvp?.gamertag, color: colors.gold },
              { label: 'Most ELITE', value: leaders.elite ? `${leaders.elite.elite_count}×` : '—', name: leaders.elite?.display_name || leaders.elite?.gamertag, color: colors.elite },
            ].map(l => (
              <div key={l.label} style={s.leaderCard}>
                <div style={{...s.leaderLabel, color: l.color}}>{l.label}</div>
                <div style={{...s.leaderStat, color: l.color}}>{l.value}</div>
                <div style={s.leaderName}>{l.name || '—'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* HALL OF SHAME */}
      {leaders && (
        <section style={{...s.section, background: 'linear-gradient(135deg,#0f0000,#07000a)'}}>
          <div style={s.sectionHead}>
            <span style={{...s.eyebrow, color: colors.gTier}}><IconFlame size={11} color={colors.gTier} /><span style={{color:colors.gTier}}>BOTTOM OF THE LOBBY</span></span>
          </div>
          <div style={s.leadersGrid}>
            {[
              { label: 'Most G Tier', value: leaders.gTier ? `${leaders.gTier.g_tier_count}×` : '—', name: leaders.gTier?.display_name || leaders.gTier?.gamertag, color: colors.gTier },
              { label: 'Worst Shooter', value: leaders.worstShooter ? `${leaders.worstShooter.career_fg_pct}% FG` : '—', name: leaders.worstShooter?.display_name || leaders.worstShooter?.gamertag, color: colors.gTier },
              { label: 'Turnover King', value: leaders.tov ? `${leaders.tov.career_tovpg} TOV/G` : '—', name: leaders.tov?.display_name || leaders.tov?.gamertag, color: colors.gTier },
            ].map(l => (
              <div key={l.label} style={{...s.leaderCard, borderColor: '#1a0000'}}>
                <div style={{...s.leaderLabel, color: l.color}}>{l.label}</div>
                <div style={{...s.leaderStat, color: l.color}}>{l.value}</div>
                <div style={s.leaderName}>{l.name || '—'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* RECENT SERIES */}
      {recentSeries.length > 0 && (
        <section style={s.section}>
          <div style={s.sectionHead}>
            <span style={s.eyebrow}><IconBall size={11} color={OR} />RECENT ACTION</span>
          </div>
          <div style={s.recentGrid}>
            {recentSeries.map(ser => {
              const highScore = Math.max(ser.our_wins, ser.opp_wins)
              const lowScore = Math.min(ser.our_wins, ser.opp_wins)
              const winner = ser.our_wins > ser.opp_wins ? ser.our_team_name : ser.opp_team_name
              return (
                <Link key={ser.id} to={`/series/${ser.id}`} style={s.recentCard}>
                  <div style={{...s.recentAccent, background: OR}} />
                  <div style={s.recentBody}>
                    <div style={s.recentName}>{ser.name}</div>
                    <div style={s.recentTeams}>{ser.our_team_name} <span style={{color:'#2a2a2a'}}>vs</span> {ser.opp_team_name}</div>
                    {ser.storyline && <div style={s.recentStory}>{ser.storyline}</div>}
                    <div style={s.recentBottom}>
                      <span style={s.recentScore}>{highScore}–{lowScore}</span>
                      <span style={{color: OR, fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.06em'}}>
                        {winner ? `${winner} wins` : 'FINAL'}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
          <div style={{textAlign:'right', marginTop:'1rem'}}>
            <Link to="/leagues" style={{color: OR, fontSize: '0.8rem', textDecoration: 'none', fontWeight: 700}}>All series →</Link>
          </div>
        </section>
      )}

      {/* FEED LINK */}
      <section style={{...s.section, background: 'linear-gradient(135deg,#06000f,#0a0008)'}}>
        <div style={s.sectionHead}>
          <span style={s.eyebrow}><IconChat size={13} color={colors.textMuted} style={{marginRight:5}} /> CREW FEED</span>
        </div>
        <div style={{ padding: '0 0 1.5rem', textAlign: 'center' }}>
          <p style={{ color: '#444', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
            Comment on stats, call out plays, talk trash — tap the chat icon on any leaderboard row to quote a stat.
          </p>
          <Link to="/feed" style={{ display: 'inline-block', background: 'transparent', border: `1px solid ${OR}`, color: OR, borderRadius: 6, padding: '0.6rem 1.5rem', fontSize: '0.85rem', fontWeight: 800, textDecoration: 'none', letterSpacing: '0.08em' }}>
            OPEN FEED →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={s.footer}>
        <div style={s.footerTop}>
          <div style={s.footerLogo}><IconBall size={14} color={OR} /><span>NEXT UP</span></div>
          <div style={s.footerLinks}>
            <Link to="/leagues" style={s.footerLink}>Series</Link>
            <Link to="/history" style={s.footerLink}>History</Link>
            {isEditor && <Link to="/import" style={s.footerLink}>Import</Link>}
          </div>
        </div>
        <div style={s.footerHow}>
          <div style={s.howTitle}>HOW IT WORKS</div>
          <div style={s.howSteps}>
            {[
              ['01', 'Drop your box score screenshot after each game'],
              ['02', 'AI parses every stat — verify and save'],
              ['03', 'Log who you guarded and which quarters'],
              ['04', 'Rankings generate automatically each series'],
            ].map(([n, t]) => (
              <div key={n} style={s.howStep}>
                <span style={s.howN}>{n}</span>
                <span style={s.howT}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={s.footerSub}>NBA 2K27 Pro-Am Stat Tracker · Built for crews that take the game seriously</div>
      </footer>
    </div>
  )
}

// ─── Active Series Card ───────────────────────────────────────────────────────

function ActiveSeriesCard({ series: ser }) {
  const pct = ser.format ? Math.max(ser.our_wins, ser.opp_wins) / Math.ceil(ser.format / 2) * 100 : 0
  return (
    <Link to={`/series/${ser.id}`} style={s.activeCard}>
      <div style={s.activeName}>{ser.name}</div>
      <div style={s.activeMatchup}>{ser.our_team_name} <span style={{color:'#333'}}>vs</span> {ser.opp_team_name}</div>
      <div style={s.activeScore}>
        <span style={s.activeNum}>{ser.our_wins}</span>
        <span style={s.activeDash}>–</span>
        <span style={s.activeNum}>{ser.opp_wins}</span>
      </div>
      <div style={s.activeBarWrap}>
        <div style={{...s.activeBar, width: `${pct}%`}} />
      </div>
      <div style={s.activeFormat}>BO{ser.format} · Game {(ser.our_wins || 0) + (ser.opp_wins || 0) + 1} next</div>
    </Link>
  )
}

// ─── Jumbotron ───────────────────────────────────────────────────────────────

const JB_STATS = [
  { key: 'career_ppg',   label: 'PPG',    color: OR,              suffix: '' },
  { key: 'career_fg_pct',label: 'FG%',    color: colors.statGreen,suffix: '%' },
  { key: 'career_3p_pct',label: '3P%',    color: colors.gold,     suffix: '%' },
  { key: 'career_apg',   label: 'APG',    color: '#60a5fa',       suffix: '' },
  { key: 'career_rpg',   label: 'RPG',    color: '#a78bfa',       suffix: '' },
  { key: 'career_spg',   label: 'SPG',    color: '#06b6d4',       suffix: '' },
  { key: 'elite_count',  label: 'ELITE',  color: colors.elite,    suffix: '' },
  { key: 'mvp_count',    label: 'MVPs',   color: colors.gold,     suffix: '' },
  { key: 'g_tier_count', label: 'G TIER', color: colors.gTier,    suffix: '', rainbow: true },
]

function Jumbotron({ careers }) {
  const navigate = useNavigate()
  const [statIdx, setStatIdx] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setFading(true)
      setTimeout(() => { setStatIdx(i => (i + 1) % JB_STATS.length); setFading(false) }, 300)
    }, 12000)
    return () => clearInterval(id)
  }, [])

  function selectStat(i) {
    if (i === statIdx) return
    setFading(true)
    setTimeout(() => { setStatIdx(i); setFading(false) }, 200)
  }

  const stat = JB_STATS[statIdx]
  const ranked = [...(careers || [])]
    .filter(p => (p.total_gp >= 3 || ['elite_count','mvp_count'].includes(stat.key)) && Number(p[stat.key]) > 0)
    .sort((a, b) => Number(b[stat.key]) - Number(a[stat.key]))
    .slice(0, 10)

  const rankColors = [colors.gold, '#b0b0b0', '#cd7f32', '#555', '#3a3a3a', '#2e2e2e', '#2e2e2e', '#2e2e2e', '#2e2e2e', '#2e2e2e']

  return (
    <section style={jb.outer}>
      {/* corner bracket decorations */}
      <div style={{...jb.corner, top:0,left:0,borderTop:`2px solid ${OR}`,borderLeft:`2px solid ${OR}`}} />
      <div style={{...jb.corner, top:0,right:0,borderTop:`2px solid ${OR}`,borderRight:`2px solid ${OR}`}} />
      <div style={{...jb.corner, bottom:0,left:0,borderBottom:`2px solid ${OR}`,borderLeft:`2px solid ${OR}`}} />
      <div style={{...jb.corner, bottom:0,right:0,borderBottom:`2px solid ${OR}`,borderRight:`2px solid ${OR}`}} />

      {/* dot-matrix overlay */}
      <div style={jb.dots} />
      {/* scanline overlay */}
      <div style={jb.scanlines} />

      {/* header bar */}
      <div style={jb.headerBar}>
        <div style={jb.headerLeft}>
          <IconTrophy size={10} color={OR} />
          <span style={jb.headerText}>ALL-TIME LEADERS</span>
        </div>
        <div style={jb.headerPipe} />
        <span style={{...jb.headerText, color: stat.color, minWidth: 48, textAlign: 'center'}}>{stat.label}</span>
        <div style={jb.headerPipe} />
        <Link to="/history" style={jb.headerLink}>FULL STATS →</Link>
      </div>

      {/* stat selector tabs */}
      <div style={jb.tabRow}>
        {JB_STATS.map((st, i) => (
          <button key={st.key} onClick={() => selectStat(i)} style={{
            ...jb.tab,
            color: i === statIdx ? st.color : '#2a2a2a',
            borderBottom: i === statIdx ? `2px solid ${st.color}` : '2px solid transparent',
            textShadow: i === statIdx ? `0 0 8px ${st.color}` : 'none',
          }}>{st.label}</button>
        ))}
      </div>

      {/* main board */}
      <div style={{ ...jb.board, opacity: fading ? 0 : 1, transition: 'opacity 0.2s' }}>
        {ranked.length === 0 ? (
          <div style={jb.empty}>Logging series populates the board</div>
        ) : ranked.map((p, i) => {
          const val = Number(p[stat.key])
          const max = Number(ranked[0][stat.key])
          const barPct = max > 0 ? (val / max) * 100 : 0
          const name = p.display_name || p.gamertag
          const valStr = `${val % 1 === 0 ? val : val.toFixed(1)}${stat.suffix}`
          const quoteStr = `${name} · ${valStr} ${stat.label} (All-Time)`
          const isTop = i === 0
          return (
            <div key={p.player_id} style={{ ...jb.row, ...(isTop ? jb.rowTop : {}) }}>
              {/* rank */}
              <span style={{ ...jb.rankNum, color: rankColors[i], textShadow: isTop ? `0 0 12px ${rankColors[0]}` : 'none' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {/* name + bar */}
              <div style={jb.rowMid}>
                <div style={jb.nameLine}>
                  <span style={{ ...jb.playerName, fontSize: isTop ? '1.05rem' : '0.82rem', color: isTop ? '#fff' : '#888' }}>{name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={stat.rainbow ? {
                      ...jb.statVal, fontSize: isTop ? '1.3rem' : '0.95rem',
                      background: RAINBOW, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    } : { ...jb.statVal, color: stat.color, fontSize: isTop ? '1.3rem' : '0.95rem', textShadow: isTop ? `0 0 16px ${stat.color}` : 'none' }}>
                      {valStr}
                    </span>
                    <button onClick={() => navigate(`/feed?quote=${encodeURIComponent(quoteStr)}`)} style={jb.chatBtn} title="Comment">
                      <IconChat size={11} color={OR} />
                    </button>
                  </div>
                </div>
                <div style={jb.barTrack}>
                  <div style={{ ...jb.barFill, width: `${barPct}%`, background: stat.rainbow ? RAINBOW : stat.color, boxShadow: isTop && !stat.rainbow ? `0 0 6px ${stat.color}` : 'none' }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* bottom strip: manage */}
      <div style={jb.bottomStrip}>
        <Link to="/history" style={jb.bottomLink}><IconTrophy size={10} color="#333" /> view all →</Link>
      </div>
    </section>
  )
}

const jb = {
  outer: {
    position: 'relative',
    margin: '1.25rem 1rem',
    background: 'linear-gradient(160deg,#040010 0%,#080014 40%,#050008 100%)',
    border: `1px solid rgba(244,112,27,0.2)`,
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: `0 0 40px rgba(244,112,27,0.08), inset 0 0 60px rgba(0,0,0,0.6)`,
  },
  corner: {
    position: 'absolute',
    width: 14,
    height: 14,
    zIndex: 4,
  },
  dots: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'radial-gradient(circle, rgba(168,85,247,0.12) 1px, transparent 1px)',
    backgroundSize: '4px 4px',
    pointerEvents: 'none',
    zIndex: 1,
  },
  scanlines: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 4px)',
    pointerEvents: 'none',
    zIndex: 2,
  },
  headerBar: {
    position: 'relative',
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(0,0,0,0.7)',
    borderBottom: `1px solid rgba(244,112,27,0.15)`,
    padding: '7px 14px',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 5 },
  headerText: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontSize: '0.68rem',
    fontWeight: 800,
    letterSpacing: '0.18em',
    color: OR,
    textTransform: 'uppercase',
  },
  headerPipe: { width: 1, height: 12, background: 'rgba(244,112,27,0.2)' },
  headerLink: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#444',
    textDecoration: 'none',
    marginLeft: 'auto',
  },
  tabRow: {
    position: 'relative',
    zIndex: 3,
    display: 'flex',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    background: 'rgba(0,0,0,0.4)',
    borderBottom: '1px solid rgba(168,85,247,0.08)',
    padding: '0 8px',
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#2a2a2a',
    fontSize: '0.62rem',
    fontWeight: 800,
    letterSpacing: '0.1em',
    padding: '6px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    textTransform: 'uppercase',
    transition: 'color 0.2s',
  },
  board: {
    position: 'relative',
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: '8px 0 4px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 14px',
    borderBottom: '1px solid rgba(168,85,247,0.04)',
  },
  rowTop: {
    background: 'rgba(244,112,27,0.04)',
    borderBottom: '1px solid rgba(244,112,27,0.08)',
  },
  rankNum: {
    fontFamily: "'Barlow Condensed', monospace",
    fontSize: '0.85rem',
    fontWeight: 900,
    minWidth: 22,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
  },
  rowMid: { flex: 1 },
  nameLine: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 3,
  },
  playerName: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  statVal: {
    fontFamily: "'Barlow Condensed', monospace",
    fontWeight: 900,
    letterSpacing: '0.02em',
    fontVariantNumeric: 'tabular-nums',
  },
  chatBtn: {
    background: 'rgba(244,112,27,0.1)',
    border: '1px solid rgba(244,112,27,0.25)',
    borderRadius: 4,
    cursor: 'pointer',
    padding: '3px 5px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  barTrack: {
    height: 2,
    background: 'rgba(168,85,247,0.06)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 1,
    transition: 'width 0.5s ease',
  },
  empty: {
    color: '#2a2a2a',
    fontSize: '0.78rem',
    textAlign: 'center',
    padding: '2rem',
    fontStyle: 'italic',
    position: 'relative',
    zIndex: 3,
  },
  bottomStrip: {
    position: 'relative',
    zIndex: 3,
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '6px 14px',
    borderTop: '1px solid rgba(168,85,247,0.06)',
    background: 'rgba(0,0,0,0.3)',
  },
  bottomLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    color: '#333',
    textDecoration: 'none',
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
  },
}

// ─── All-Time Leaderboard ─────────────────────────────────────────────────────

const LB_STATS = [
  { key: 'career_ppg', label: 'PPG', color: OR },
  { key: 'career_fg_pct', label: 'FG%', color: colors.statGreen, suffix: '%' },
  { key: 'career_3p_pct', label: '3P%', color: colors.gold, suffix: '%' },
  { key: 'career_apg', label: 'APG', color: '#60a5fa' },
  { key: 'career_rpg', label: 'RPG', color: '#a78bfa' },
  { key: 'career_spg', label: 'SPG', color: '#06b6d4' },
  { key: 'elite_count', label: 'ELITE', color: colors.elite },
  { key: 'mvp_count', label: 'MVPs', color: colors.gold },
  { key: 'g_tier_count', label: 'G TIER', color: colors.gTier, rainbow: true },
]

function AllTimeLeaderboard() {
  const navigate = useNavigate()
  const [careers, setCareers] = useState([])
  const [tab, setTab] = useState('career_ppg')
  const [excluded, setExcluded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('lb_excluded') || '[]')) } catch { return new Set() }
  })
  const [managing, setManaging] = useState(false)

  useEffect(() => {
    supabase.from('career_player_totals').select('*').then(({ data }) => setCareers(data || []))
  }, [])

  function toggleExclude(gamertag) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(gamertag)) next.delete(gamertag)
      else next.add(gamertag)
      try { localStorage.setItem('lb_excluded', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const stat = LB_STATS.find(s => s.key === tab) || LB_STATS[0]
  const ranked = [...careers]
    .filter(p => !excluded.has(p.gamertag) && p.total_gp >= (['career_fg_pct','career_3p_pct'].includes(tab) ? 0 : 3) && Number(p[tab]) > 0)
    .sort((a, b) => Number(b[tab]) - Number(a[tab]))
    .slice(0, 10)

  return (
    <div style={lb.wrap}>
      <div style={lb.header}>
        <div style={lb.title}><IconTrophy size={12} color={OR} /><span>ALL-TIME LEADERBOARD</span></div>
        <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
          <button onClick={() => setManaging(m => !m)} style={lb.manageBtn}>
            {managing ? 'Done' : 'Filter'}
          </button>
          <Link to="/history" style={lb.more}>Full history →</Link>
        </div>
      </div>
      {managing && (
        <div style={lb.managePanel}>
          <div style={lb.manageLabel}>Tap to exclude from leaderboards</div>
          <div style={lb.manageGrid}>
            {careers.map(p => {
              const isEx = excluded.has(p.gamertag)
              return (
                <button key={p.gamertag} onClick={() => toggleExclude(p.gamertag)} style={{...lb.manageChip, ...(isEx ? lb.manageChipEx : {})}}>
                  {isEx && <IconX size={10} color="currentColor" />}{p.display_name || p.gamertag}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div style={lb.tabs}>
        {LB_STATS.map(st => {
          const active = tab === st.key
          const isRainbow = st.rainbow && active
          return (
            <button key={st.key} onClick={() => setTab(st.key)} style={{
              ...lb.tab,
              color: active ? (isRainbow ? 'transparent' : st.color) : '#333',
              borderBottomColor: isRainbow ? 'transparent' : active ? st.color : 'transparent',
              ...(isRainbow ? { background: RAINBOW, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', borderBottom: '2px solid', borderImageSlice: 1, borderImageSource: RAINBOW } : {}),
            }}>
              {st.label}
            </button>
          )
        })}
      </div>
      {ranked.length === 0 ? (
        <div style={lb.empty}>Stats populate as series are logged.</div>
      ) : (
        <div style={lb.list}>
          {ranked.map((p, i) => {
            const val = Number(p[tab])
            const max = Number(ranked[0][tab])
            const pct = max > 0 ? (val / max) * 100 : 0
            const name = p.display_name || p.gamertag
            const rankColor = i === 0 ? colors.gold : i === 1 ? '#aaa' : i === 2 ? '#cd7f32' : '#2a2a2a'
            const valStr = `${val % 1 === 0 ? val : val.toFixed(1)}${stat.suffix || ''}`
            const quoteStr = `${name} · ${valStr} ${stat.label} (All-Time)`
            return (
              <div key={p.player_id} style={lb.row}>
                <span style={{...lb.rank, color: rankColor}}>{i + 1}</span>
                <div style={lb.info}>
                  <div style={lb.nameRow}>
                    <span style={lb.name}>{name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={stat.rainbow ? {
                        ...lb.val, background: RAINBOW, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      } : {...lb.val, color: stat.color}}>
                        {valStr}
                      </span>
                      <button
                        onClick={() => navigate(`/feed?quote=${encodeURIComponent(quoteStr)}`)}
                        style={lb.commentBtn}
                        title="Comment on this stat"
                      >
                        <IconChat size={12} color="#444" />
                      </button>
                    </div>
                  </div>
                  <div style={lb.track}>
                    <div style={{...lb.fill, width: `${pct}%`, background: stat.rainbow ? RAINBOW : stat.color}} />
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

// ─── Comment Ticker ───────────────────────────────────────────────────────────

function CommentTicker({ comments }) {
  const doubled = [...comments, ...comments]
  // duration scales with number of items so speed stays consistent
  const duration = Math.max(20, comments.length * 6)

  return (
    <div style={tk.wrap}>
      {/* ESPN-style left badge */}
      <div style={tk.badge}>
        <span style={tk.badgeTop}>NEXT UP</span>
        <span style={tk.badgeBottom}>CREW FEED</span>
      </div>
      <div style={tk.divider} />
      {/* scrolling content — CSS animation, works on mobile */}
      <div style={tk.trackWrap}>
        <div style={{ ...tk.track, animationDuration: `${duration}s` }}>
          {doubled.map((c, i) => (
            <span key={i} style={tk.item}>
              <span style={tk.who}>{(c.gamertag || '').toUpperCase()}</span>
              <span style={tk.colon}>:</span>
              <span style={tk.text}>{c.body || c.content}</span>
              <span style={tk.pipe}>|</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Comment Box ─────────────────────────────────────────────────────────────

function CommentBox({ onPost }) {
  const [gtag, setGtag] = useState('')
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [done, setDone] = useState(false)
  const [players, setPlayers] = useState([])
  const [showDrop, setShowDrop] = useState(false)

  useEffect(() => {
    supabase.from('players').select('gamertag,display_name').order('gamertag').then(({ data }) => setPlayers(data || []))
  }, [])

  const filtered = gtag.length >= 1
    ? players.filter(p => p.gamertag.toLowerCase().includes(gtag.toLowerCase())).slice(0, 5)
    : []

  async function post() {
    if (!gtag.trim() || !text.trim()) return
    setPosting(true)
    const { data, error } = await supabase.from('comments').insert({
      gamertag: gtag.trim(),
      content: text.trim().slice(0, 200),
    }).select().single()
    setPosting(false)
    if (!error && data) {
      onPost(data)
      setText('')
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    }
  }

  return (
    <section style={{...s.section, background: 'linear-gradient(135deg,#06000f,#0a0008)'}}>
      <div style={s.sectionHead}>
        <span style={s.eyebrow}><IconChat size={13} color={colors.textMuted} style={{marginRight:5}} /> LOBBY TALK</span>
      </div>
      <div style={cb.wrap}>
        <div style={{position:'relative'}}>
          <input
            style={cb.input}
            placeholder="Your gamertag..."
            value={gtag}
            onChange={e => { setGtag(e.target.value); setShowDrop(true) }}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            autoComplete="off"
          />
          {showDrop && filtered.length > 0 && (
            <div style={cb.drop}>
              {filtered.map(p => (
                <div key={p.gamertag} style={cb.dropItem} onMouseDown={() => { setGtag(p.gamertag); setShowDrop(false) }}>
                  {p.gamertag}
                  {p.display_name && p.display_name !== p.gamertag && <span style={{color:'#444', marginLeft:6}}>({p.display_name})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <textarea
          style={cb.textarea}
          placeholder="Say something about last night's series... (200 chars max)"
          value={text}
          onChange={e => setText(e.target.value.slice(0, 200))}
          rows={2}
        />
        <div style={cb.footer}>
          <span style={cb.count}>{text.length}/200</span>
          {done ? (
            <span style={{color: colors.statGreen, fontSize: '0.82rem', fontWeight: 700, display:'flex', alignItems:'center', gap:4}}><IconCheck size={13} color={colors.statGreen} /> Posted</span>
          ) : (
            <button style={cb.btn} onClick={post} disabled={posting || !gtag.trim() || !text.trim()}>
              {posting ? 'Posting...' : 'Post'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Countdown ───────────────────────────────────────────────────────────────

function Countdown() {
  const TARGET = new Date('2026-09-04T00:00:00')
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const diff = Math.max(0, TARGET - now)
  if (diff === 0) return null
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const sec = Math.floor((diff % 60000) / 1000)
  return (
    <div style={cd.bar}>
      <span style={cd.badge}>2K27</span>
      <span style={cd.label}>drops Sep 4 — finish your 2K26 business</span>
      <div style={cd.clock}>
        {[[d,'d'],[h,'h'],[m,'m'],[sec,'s']].map(([n,l]) => (
          <span key={l} style={cd.unit}><b style={cd.n}>{String(n).padStart(2,'0')}</b><span style={cd.l}>{l}</span></span>
        ))}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maxBy(arr, key) {
  if (!arr?.length) return null
  return arr.reduce((b, c) => Number(c[key]||0) > Number(b[key]||0) ? c : b, arr[0])
}

function computeLeaders(careers) {
  if (!careers?.length) return null
  const withGP = careers.filter(p => p.total_gp >= 3)
  const withFG = careers.filter(p => p.career_fga >= 10)
  const withThree = careers.filter(p => p.career_tpa >= 5)
  return {
    scorer: maxBy(withGP, 'career_ppg'),
    shooter: maxBy(withFG, 'career_fg_pct'),
    threePoint: maxBy(withThree, 'career_3p_pct'),
    playmaker: maxBy(withGP, 'career_apg'),
    rebounder: maxBy(withGP, 'career_rpg'),
    lockdown: maxBy(withGP, 'career_spg'),
    mvp: maxBy(careers, 'mvp_count'),
    elite: maxBy(careers, 'elite_count'),
    gTier: maxBy(careers, 'g_tier_count'),
    worstShooter: withFG.length ? withFG.reduce((w,c) => Number(c.career_fg_pct) < Number(w.career_fg_pct) ? c : w, withFG[0]) : null,
    tov: maxBy(withGP, 'career_tovpg'),
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 80, position: 'relative' },
  arcadeBg: { position: 'fixed', inset: 0, backgroundImage: 'url(/arcade-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center top', opacity: 0.06, pointerEvents: 'none', zIndex: 0, filter: 'saturate(1.4)' },

  nav: { position: 'sticky', top: 0, zIndex: 200, background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(16px)', borderBottom: `1px solid rgba(168,85,247,0.2)`, boxShadow: `0 1px 24px rgba(168,85,247,0.06)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', height: 52 },
  logo: { display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '1.15rem', letterSpacing: '0.28em', color: '#fff', textShadow: `0 0 20px ${NEON_P_GLOW}`, textTransform: 'uppercase' },
  navRight: { display: 'flex', alignItems: 'center', gap: '0.25rem' },
  navLink: { color: '#555', textDecoration: 'none', fontSize: '0.82rem', padding: '0.4rem 0.6rem', fontFamily: "'Inter', system-ui, sans-serif" },
  navCta: { background: VICE, color: '#fff', textDecoration: 'none', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '0.88rem', fontWeight: 800, padding: '0.35rem 0.9rem', borderRadius: 6, marginLeft: '0.25rem', letterSpacing: '0.1em', textTransform: 'uppercase' },
  navProfile: { display: 'flex', alignItems: 'center', gap: 7 },
  navAvatar: { width: 28, height: 28, borderRadius: '50%', background: OR, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '0.85rem', color: '#000', flexShrink: 0 },
  navProfileLabel: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: '#888', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  navSignOut: { background: 'none', border: '1px solid #222', borderRadius: 4, color: '#444', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '0.2rem 0.45rem', cursor: 'pointer', fontFamily: "'Barlow Condensed', system-ui, sans-serif" },

  activeSection: { padding: '1rem 1rem 0' },
  sectionLabel: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' },
  pulse: { width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444', animation: 'pulse 1.5s infinite' },

  activeGrid: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  activeCard: { display: 'block', background: 'linear-gradient(135deg,#060010,#0a0018)', border: `1px solid rgba(168,85,247,0.25)`, boxShadow: `0 0 24px rgba(168,85,247,0.08)`, borderRadius: 12, padding: '1rem 1.25rem', textDecoration: 'none', color: 'inherit' },
  activeName: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 800, fontSize: '1.1rem', color: '#fff', marginBottom: '0.2rem', letterSpacing: '0.08em', textTransform: 'uppercase' },
  activeMatchup: { color: '#555', fontSize: '0.75rem', marginBottom: '0.75rem', fontFamily: "'Inter', system-ui, sans-serif" },
  activeScore: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' },
  activeNum: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '2.8rem', color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 30px ${NEON_P_GLOW}` },
  activeDash: { color: '#2a2a2a', fontWeight: 900, fontSize: '1.5rem' },
  activeBarWrap: { height: 3, background: '#1a1a1a', borderRadius: 2, marginBottom: '0.5rem', overflow: 'hidden' },
  activeBar: { height: '100%', background: VICE, borderRadius: 2, transition: 'width 0.6s ease', boxShadow: `0 0 8px ${NEON_P}` },
  activeFormat: { color: '#444', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' },

  section: { padding: '1.5rem 1rem', borderBottom: `1px solid rgba(168,85,247,0.06)`, background: '#000' },
  sectionHead: { marginBottom: '1.25rem' },
  eyebrow: { display: 'inline-flex', alignItems: 'center', gap: 5, color: NEON_P, fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.3rem' },
  h2: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '1.6rem', fontWeight: 900, margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' },

  badgeRow: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  badgeGroup: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  badgeLabel: { display: 'flex', alignItems: 'center', gap: 5, color: OR, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '0.25rem' },
  badgeCard: { display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'linear-gradient(135deg,#080808,#0c0010)', border: `1px solid rgba(168,85,247,0.15)`, borderRadius: 8, padding: '0.6rem 0.9rem' },
  badgeName: { flex: 1, fontWeight: 700, fontSize: '0.9rem', color: '#fff' },

  leadersGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'rgba(168,85,247,0.08)', border: `1px solid rgba(168,85,247,0.12)`, borderRadius: 10, overflow: 'hidden' },
  leaderCard: { background: '#000', padding: '0.9rem 1rem', border: '0 solid transparent' },
  leaderLabel: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '0.3rem' },
  leaderStat: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '1.8rem', fontWeight: 900, lineHeight: 1, marginBottom: '0.2rem', letterSpacing: '0.02em' },
  leaderName: { color: '#555', fontSize: '0.75rem', fontWeight: 500, fontFamily: "'Inter', system-ui, sans-serif" },

  recentGrid: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  recentCard: { display: 'flex', background: 'linear-gradient(135deg,#070010,#0a0a0a)', border: `1px solid rgba(168,85,247,0.12)`, borderRadius: 10, overflow: 'hidden', textDecoration: 'none', color: 'inherit' },
  recentAccent: { width: 4, flexShrink: 0 },
  recentBody: { padding: '0.9rem 1rem', flex: 1 },
  recentName: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 800, fontSize: '1.05rem', color: '#fff', marginBottom: '0.15rem', letterSpacing: '0.06em', textTransform: 'uppercase' },
  recentTeams: { color: '#333', fontSize: '0.72rem', marginBottom: '0.5rem' },
  recentStory: { color: '#555', fontSize: '0.78rem', lineHeight: 1.5, marginBottom: '0.5rem', fontStyle: 'italic' },
  recentBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  recentScore: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '1.4rem', color: '#fff', fontVariantNumeric: 'tabular-nums' },

  footer: { background: '#050005', borderTop: `1px solid rgba(168,85,247,0.12)`, padding: '2rem 1rem 1.5rem' },
  footerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  footerLogo: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 900, fontSize: '0.85rem', letterSpacing: '0.22em', color: '#333' },
  footerLinks: { display: 'flex', gap: '1rem' },
  footerLink: { color: '#333', textDecoration: 'none', fontSize: '0.78rem' },
  footerHow: { marginBottom: '1.5rem' },
  howTitle: { color: 'rgba(168,85,247,0.3)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.75rem' },
  howSteps: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  howStep: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  howN: { color: NEON_P, fontSize: '0.65rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', minWidth: 18 },
  howT: { color: '#2a2a2a', fontSize: '0.78rem', lineHeight: 1.5 },
  footerSub: { color: '#1a1a1a', fontSize: '0.68rem' },
}

const tk = {
  wrap: {
    display: 'flex',
    alignItems: 'stretch',
    background: '#0d0d0d',
    borderTop: '1px solid #1a1a1a',
    borderBottom: '1px solid #1a1a1a',
    overflow: 'hidden',
    height: 38,
    flexShrink: 0,
  },
  badge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: OR,
    padding: '0 10px',
    flexShrink: 0,
    lineHeight: 1,
    gap: 1,
  },
  badgeTop: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 900,
    fontSize: '0.62rem',
    letterSpacing: '0.16em',
    color: '#000',
    textTransform: 'uppercase',
  },
  badgeBottom: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 700,
    fontSize: '0.5rem',
    letterSpacing: '0.12em',
    color: 'rgba(0,0,0,0.6)',
    textTransform: 'uppercase',
  },
  divider: {
    width: 3,
    background: '#222',
    flexShrink: 0,
  },
  trackWrap: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
  },
  track: {
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    paddingLeft: 12,
    animation: 'tickerScroll linear infinite',
    willChange: 'transform',
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  who: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 800,
    fontSize: '0.78rem',
    letterSpacing: '0.08em',
    color: OR,
  },
  colon: {
    color: '#555',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  text: {
    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
    fontWeight: 600,
    fontSize: '0.8rem',
    letterSpacing: '0.03em',
    color: '#e0e0e0',
  },
  pipe: {
    color: '#2a2a2a',
    fontSize: '0.85rem',
    fontWeight: 300,
    margin: '0 14px',
  },
}

const lb = {
  wrap: { background: 'linear-gradient(135deg,#070010,#080808)', border: `1px solid rgba(168,85,247,0.15)`, boxShadow: `0 0 32px rgba(168,85,247,0.05)`, borderRadius: 12, overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.9rem 1rem 0.5rem' },
  title: { display: 'flex', alignItems: 'center', gap: 5, color: NEON_P, fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' },
  more: { color: '#444', fontSize: '0.7rem', textDecoration: 'none' },
  tabs: { display: 'flex', padding: '0 0.5rem', borderBottom: `1px solid rgba(168,85,247,0.1)`, overflowX: 'auto', scrollbarWidth: 'none' },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', color: '#333', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', padding: '0.4rem 0.5rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  list: { padding: '0.5rem 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  rank: { fontSize: '0.7rem', fontWeight: 900, minWidth: 14, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  info: { flex: 1 },
  nameRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.15rem' },
  name: { color: '#ccc', fontSize: '0.82rem', fontWeight: 600 },
  val: { fontWeight: 800, fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums' },
  track: { height: 2, background: 'rgba(168,85,247,0.08)', borderRadius: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 1, transition: 'width 0.4s' },
  empty: { color: '#2a2a2a', fontSize: '0.78rem', textAlign: 'center', padding: '2rem', fontStyle: 'italic' },
  manageBtn: { background: 'transparent', border: `1px solid rgba(168,85,247,0.3)`, borderRadius: 4, color: '#666', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', padding: '0.2rem 0.5rem', cursor: 'pointer', fontFamily: "'Inter', sans-serif" },
  managePanel: { padding: '0.6rem 0.75rem 0.75rem', borderBottom: `1px solid rgba(168,85,247,0.1)` },
  manageLabel: { fontSize: '0.6rem', color: '#333', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' },
  manageGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
  manageChip: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 5, color: '#888', fontSize: '0.72rem', fontWeight: 600, padding: '0.3rem 0.6rem', cursor: 'pointer', fontFamily: "'Inter', sans-serif" },
  manageChipEx: { background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626' },
  commentBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 },
}

const cb = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  input: { background: '#0a000f', border: `1px solid rgba(168,85,247,0.2)`, borderRadius: 8, color: '#fff', padding: '0.65rem 0.9rem', fontSize: '0.9rem', outline: 'none', width: '100%', boxSizing: 'border-box' },
  drop: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#0e0018', border: `1px solid rgba(168,85,247,0.2)`, borderRadius: 6, zIndex: 50, overflow: 'hidden' },
  dropItem: { padding: '0.5rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem', color: '#ccc', borderBottom: `1px solid rgba(168,85,247,0.08)` },
  textarea: { background: '#0a000f', border: `1px solid rgba(168,85,247,0.15)`, borderRadius: 8, color: '#ccc', padding: '0.65rem 0.9rem', fontSize: '0.85rem', outline: 'none', width: '100%', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.5 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  count: { color: '#333', fontSize: '0.72rem' },
  btn: { background: VICE, color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1.25rem', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em' },
}

const cd = {
  bar: { background: 'linear-gradient(90deg,#06000f,#0a000a)', borderBottom: `1px solid rgba(168,85,247,0.2)`, display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 1rem', flexWrap: 'wrap' },
  badge: { background: VICE, color: '#fff', fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.1em', padding: '0.15rem 0.5rem', borderRadius: 3 },
  label: { color: '#444', fontSize: '0.72rem', flex: 1 },
  clock: { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  unit: { display: 'flex', alignItems: 'baseline', gap: 1 },
  n: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", color: NEON_P, fontWeight: 900, fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums', textShadow: `0 0 10px ${NEON_P}` },
  l: { color: '#333', fontSize: '0.55rem', fontFamily: "'Inter', system-ui, sans-serif" },
}
