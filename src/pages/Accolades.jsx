import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { colors } from '../lib/theme'
import { IconTrophy, IconFlame, IconTarget, IconThree, IconPass, IconShield, IconStar, IconBall, IconReb } from '../lib/icons'

const AWARD_META = {
  'MVP':                { icon: <IconStar size={18} color={colors.gold} filled />, color: colors.gold, label: 'Series MVP' },
  'Best Shooter':       { icon: <IconTarget size={18} color={colors.statGreen} />, color: colors.statGreen, label: 'Best Shooter' },
  'Top Playmaker':      { icon: <IconPass size={18} color={colors.blue} />, color: colors.blue, label: 'Top Playmaker' },
  'Defensive POTS':     { icon: <IconShield size={18} color="#06b6d4" />, color: "#06b6d4", label: 'Defensive Player' },
  'Iron Man':           { icon: <IconBall size={18} color={colors.orange} />, color: colors.orange, label: 'Iron Man' },
  'Zero-TO':            { icon: <IconTarget size={18} color={colors.statGreen} />, color: colors.statGreen, label: 'Zero Turnovers' },
  'Most Efficient':     { icon: <IconFlame size={18} color={colors.orange} />, color: colors.orange, label: 'Most Efficient' },
  'Worst Player':       { icon: <IconFlame size={18} color={colors.gTier} />, color: colors.gTier, label: 'Worst Player' },
  'Best from Three':    { icon: <IconThree size={18} color={colors.gold} />, color: colors.gold, label: 'Best from Three' },
  'Glass Cleaner':      { icon: <IconReb size={18} color="#8b5cf6" />, color: "#8b5cf6", label: 'Glass Cleaner' },
  'Biggest Explosion':  { icon: <IconFlame size={18} color={colors.orange} />, color: colors.orange, label: 'Biggest Explosion' },
  'Glow-Up':            { icon: <IconTrophy size={18} color={colors.gold} />, color: colors.gold, label: 'Glow-Up Award' },
  'Pretender':          { icon: <IconFlame size={18} color={colors.gTier} />, color: colors.gTier, label: 'The Pretender' },
}

export default function Accolades() {
  const { id: seriesId } = useParams()
  const [series, setSeries] = useState(null)
  const [awards, setAwards] = useState([])
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [seriesId])

  async function fetchData() {
    const [{ data: ser }, { data: aw }, { data: st }] = await Promise.all([
      supabase.from('series').select('*').eq('id', seriesId).single(),
      supabase.from('series_awards').select('*, players(gamertag, display_name)').eq('series_id', seriesId),
      supabase.from('series_player_stats').select('*').eq('series_id', seriesId),
    ])
    setSeries(ser)
    setAwards(aw || [])

    // Auto-compute nominations from stats if no awards saved yet
    if ((!aw || aw.length === 0) && st && st.length > 0) {
      setAwards(computeAwards(st, ser))
    }
    setStats(st || [])
    setLoading(false)
  }

  if (loading) return <div style={s.page}><p style={s.dim}>Loading...</p></div>
  if (!series) return <div style={s.page}><p style={s.dim}>Series not found.</p></div>

  // Group awards by player
  const byPlayer = {}
  awards.forEach(a => {
    const gtag = a.players?.gamertag || a.gamertag
    if (!byPlayer[gtag]) byPlayer[gtag] = []
    byPlayer[gtag].push(a)
  })

  // Sort: most awards first, shame awards last
  const sorted = Object.entries(byPlayer).sort((a, b) => {
    const aShame = a[1].every(x => ['Worst Player', 'Pretender'].includes(x.award))
    const bShame = b[1].every(x => ['Worst Player', 'Pretender'].includes(x.award))
    if (aShame && !bShame) return 1
    if (!aShame && bShame) return -1
    return b[1].length - a[1].length
  })

  const positiveAwards = awards.filter(a => !['Worst Player', 'Pretender'].includes(a.award))
  const negativeAwards = awards.filter(a => ['Worst Player', 'Pretender'].includes(a.award))

  return (
    <div style={s.page}>
      <Link to={`/series/${seriesId}`} style={s.back}>← Back to Series</Link>

      <div style={s.header}>
        <div style={s.eyebrow}>
          <IconTrophy size={14} color={colors.gold} />
          <span>SERIES ACCOLADES</span>
        </div>
        <h1 style={s.title}>{series.name}</h1>
        <div style={s.meta}>{series.our_team_name} vs {series.opp_team_name} · {series.result_label || `${series.our_wins}–${series.opp_wins}`}</div>
      </div>

      {awards.length === 0 ? (
        <div style={s.empty}>
          <IconTrophy size={36} color={colors.border} />
          <p style={s.emptyText}>Accolades will generate once games are logged.</p>
        </div>
      ) : (
        <>
          {/* Award wall — horizontal scroll cards */}
          <div style={s.awardWall}>
            {positiveAwards.map((aw, i) => {
              const meta = AWARD_META[aw.award] || { icon: <IconTrophy size={18} color={colors.gold} />, color: colors.gold, label: aw.award }
              const name = aw.players?.display_name || aw.players?.gamertag || aw.gamertag
              return (
                <div key={i} style={{ ...s.awardCard, borderTopColor: meta.color }}>
                  <div style={s.awardIcon}>{meta.icon}</div>
                  <div style={{ ...s.awardLabel, color: meta.color }}>{meta.label}</div>
                  <div style={s.awardPlayer}>{name}</div>
                  {aw.detail && <div style={s.awardDetail}>{aw.detail}</div>}
                </div>
              )
            })}
          </div>

          {/* Shame wall */}
          {negativeAwards.length > 0 && (
            <>
              <div style={s.divider}>
                <span style={s.dividerText}>HALL OF SHAME</span>
              </div>
              <div style={s.awardWall}>
                {negativeAwards.map((aw, i) => {
                  const meta = AWARD_META[aw.award] || { icon: <IconFlame size={18} color={colors.gTier} />, color: colors.gTier, label: aw.award }
                  const name = aw.players?.display_name || aw.players?.gamertag || aw.gamertag
                  return (
                    <div key={i} style={{ ...s.awardCard, borderTopColor: meta.color, background: 'rgba(220,38,38,0.04)' }}>
                      <div style={s.awardIcon}>{meta.icon}</div>
                      <div style={{ ...s.awardLabel, color: meta.color }}>{meta.label}</div>
                      <div style={s.awardPlayer}>{name}</div>
                      {aw.detail && <div style={s.awardDetail}>{aw.detail}</div>}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Player accolade summary */}
          <div style={s.summaryWrap}>
            <div style={s.summaryTitle}>Player Breakdown</div>
            <div style={s.summaryList}>
              {sorted.map(([gtag, playerAwards]) => {
                const isShame = playerAwards.every(a => ['Worst Player', 'Pretender'].includes(a.award))
                return (
                  <div key={gtag} style={{ ...s.summaryRow, borderLeftColor: isShame ? colors.gTier : colors.gold }}>
                    <div style={s.summaryName}>{gtag}</div>
                    <div style={s.summaryAwards}>
                      {playerAwards.map((a, i) => {
                        const meta = AWARD_META[a.award]
                        return (
                          <span key={i} style={{ ...s.summaryBadge, borderColor: meta?.color || colors.gold, color: meta?.color || colors.gold }}>
                            {a.award}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Deterministic award computation from series stats
function computeAwards(stats, series) {
  if (!stats || stats.length === 0) return []
  const awards = []
  const withGP = stats.filter(p => p.gp >= 2)
  const withFG = stats.filter(p => p.total_fga >= 8)
  const withThree = stats.filter(p => p.total_tpa >= 4)

  const maxBy = (arr, key) => arr.length ? arr.reduce((b, c) => Number(c[key]||0) > Number(b[key]||0) ? c : b, arr[0]) : null
  const minBy = (arr, key) => arr.length ? arr.reduce((b, c) => Number(c[key]||0) < Number(b[key]||0) ? c : b, arr[0]) : null

  const topScorer = maxBy(withGP, 'ppg')
  if (topScorer) awards.push({ award: 'MVP', gamertag: topScorer.gamertag, players: { gamertag: topScorer.gamertag, display_name: topScorer.display_name }, detail: `${topScorer.ppg} PPG · ${topScorer.fg_pct}% FG` })

  const bestFG = maxBy(withFG, 'fg_pct')
  if (bestFG) awards.push({ award: 'Best Shooter', gamertag: bestFG.gamertag, players: { gamertag: bestFG.gamertag, display_name: bestFG.display_name }, detail: `${bestFG.fg_pct}% FG · ${bestFG.ppg} PPG` })

  const best3P = maxBy(withThree, 'three_pct')
  if (best3P) awards.push({ award: 'Best from Three', gamertag: best3P.gamertag, players: { gamertag: best3P.gamertag, display_name: best3P.display_name }, detail: `${best3P.three_pct}% on ${best3P.total_tpa} attempts` })

  const topAST = maxBy(withGP, 'apg')
  if (topAST) awards.push({ award: 'Top Playmaker', gamertag: topAST.gamertag, players: { gamertag: topAST.gamertag, display_name: topAST.display_name }, detail: `${topAST.apg} APG` })

  const topDef = maxBy(withGP, 'spg')
  if (topDef) awards.push({ award: 'Defensive POTS', gamertag: topDef.gamertag, players: { gamertag: topDef.gamertag, display_name: topDef.display_name }, detail: `${topDef.spg} SPG · ${topDef.bpg} BPG` })

  const topReb = maxBy(withGP, 'rpg')
  if (topReb) awards.push({ award: 'Glass Cleaner', gamertag: topReb.gamertag, players: { gamertag: topReb.gamertag, display_name: topReb.display_name }, detail: `${topReb.rpg} RPG` })

  const zeroTO = withGP.find(p => Number(p.tovpg) === 0)
  if (zeroTO) awards.push({ award: 'Zero-TO', gamertag: zeroTO.gamertag, players: { gamertag: zeroTO.gamertag, display_name: zeroTO.display_name }, detail: '0.0 TOV/G across the series' })

  const ironMan = withGP.find(p => p.gp >= (series?.format || 7))
  if (ironMan) awards.push({ award: 'Iron Man', gamertag: ironMan.gamertag, players: { gamertag: ironMan.gamertag, display_name: ironMan.display_name }, detail: `Played all ${series?.format || 7} games` })

  const worstFG = withFG.length ? minBy(withFG, 'fg_pct') : null
  if (worstFG) awards.push({ award: 'Worst Player', gamertag: worstFG.gamertag, players: { gamertag: worstFG.gamertag, display_name: worstFG.display_name }, detail: `${worstFG.fg_pct}% FG · ${worstFG.ppg} PPG` })

  return awards
}

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', padding: '2rem', maxWidth: 1000, margin: '0 auto', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  back: { color: '#444', textDecoration: 'none', fontSize: '0.8rem', display: 'block', marginBottom: '1.5rem' },
  header: { marginBottom: '2.5rem' },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 6, color: colors.gold, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.5rem' },
  title: { margin: '0 0 0.3rem', fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.01em' },
  meta: { color: '#444', fontSize: '0.82rem' },
  empty: { textAlign: 'center', padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' },
  emptyText: { color: '#333', fontSize: '0.9rem', margin: 0 },
  awardWall: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1px', background: '#111', border: '1px solid #111', borderRadius: 10, overflow: 'hidden', marginBottom: '2rem' },
  awardCard: { background: '#000', padding: '1.25rem', borderTop: '3px solid', transition: 'background 0.1s' },
  awardIcon: { marginBottom: '0.6rem', opacity: 0.9 },
  awardLabel: { fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' },
  awardPlayer: { fontWeight: 800, fontSize: '1rem', color: '#fff', marginBottom: '0.3rem' },
  awardDetail: { color: '#555', fontSize: '0.78rem', lineHeight: 1.4 },
  divider: { display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0', color: colors.gTier },
  dividerText: { fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', color: colors.gTier, whiteSpace: 'nowrap' },
  summaryWrap: { background: '#080808', border: '1px solid #111', borderRadius: 10, padding: '1.25rem', marginTop: '2rem' },
  summaryTitle: { color: '#444', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' },
  summaryList: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  summaryRow: { display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '3px solid', paddingLeft: '0.75rem', flexWrap: 'wrap' },
  summaryName: { fontWeight: 700, color: '#fff', fontSize: '0.9rem', minWidth: 140 },
  summaryAwards: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  summaryBadge: { border: '1px solid', borderRadius: 4, padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600 },
  dim: { color: '#444' },
}
