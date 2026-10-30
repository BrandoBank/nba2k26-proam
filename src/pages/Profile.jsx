import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { colors, fonts } from '../lib/theme'
import { IconTrophy, IconFlame, IconBall, IconArrow, IconShield, IconStar, IconChat } from '../lib/icons'

const OR = colors.orange
const NEON_P = '#a855f7'
const RAINBOW = 'linear-gradient(90deg,#f87171,#fb923c,#facc15,#4ade80,#60a5fa,#a78bfa,#f472b6)'

const TIER_COLOR = {
  ELITE: colors.elite,
  STRONG: colors.statGreen,
  AVERAGE: '#60a5fa',
  WEAK: '#f97316',
  G_TIER: colors.gTier,
}
const TIER_LABEL = {
  ELITE: 'ELITE',
  STRONG: 'STRONG',
  AVERAGE: 'AVG',
  WEAK: 'WEAK',
  G_TIER: 'G TIER',
}

export default function Profile() {
  const { gamertag } = useParams()
  const navigate = useNavigate()
  const { gamertag: authGamertag } = useAuth()
  const isOwnProfile = authGamertag === gamertag
  const shareRef = useRef(null)

  const [player, setPlayer] = useState(null)
  const [career, setCareer] = useState(null)
  const [allCareers, setAllCareers] = useState([])
  const [rankings, setRankings] = useState([])
  const [seriesStats, setSeriesStats] = useState({})
  const [bestGames, setBestGames] = useState([])
  const [h2h, setH2h] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [gamertag])

  async function loadProfile() {
    setLoading(true)
    setLoadError('')
    try {
    const [{ data: playerRow, error: e1 }, { data: careerRow }, { data: allCareerRows }] = await Promise.all([
      supabase.from('players').select('id,gamertag,display_name').eq('gamertag', gamertag).maybeSingle(),
      supabase.from('career_player_totals').select('*').eq('gamertag', gamertag).maybeSingle(),
      supabase.from('career_player_totals').select('*'),
    ])

    if (e1) throw new Error('Failed to load player data.')

    setPlayer(playerRow)
    setCareer(careerRow)
    setAllCareers(allCareerRows || [])

    if (playerRow?.id) {
      const [{ data: rankRows }, { data: gameRows }, { data: spaRows }, { data: allSpaRows }] = await Promise.all([
        supabase.from('series_rankings')
          .select('*, series(id,name,our_wins,opp_wins,ended_at)')
          .eq('player_id', playerRow.id)
          .eq('finalized', true),
        supabase.from('game_stats')
          .select('id,pts,reb,ast,stl,fgm,fga,tpm,tpa')
          .eq('player_id', playerRow.id)
          .order('pts', { ascending: false })
          .limit(3),
        supabase.from('series_player_averages')
          .select('series_id,side,gp,ppg,rpg,apg,spg,fg_pct,three_pct,best_pts')
          .eq('player_id', playerRow.id),
        supabase.from('series_player_averages')
          .select('series_id,player_id,gamertag,display_name,side'),
      ])

      setRankings(rankRows || [])
      setBestGames((gameRows || []).filter(g => g.pts != null))

      // Series stat line map keyed by series_id
      const statsMap = {}
      ;(spaRows || []).forEach(r => { statsMap[r.series_id] = r })
      setSeriesStats(statsMap)

      // H2H: for each series this player appeared in, find opponents and track W/L
      const myRankMap = {}
      ;(rankRows || []).forEach(r => {
        if (r.series) myRankMap[r.series_id || r.series?.id] = r
      })
      const h2hMap = {}
      ;(spaRows || []).forEach(myRow => {
        const rankRow = (rankRows || []).find(r => (r.series_id || r.series?.id) === myRow.series_id)
        const ser = rankRow?.series
        if (!ser) return
        const oppSide = myRow.side === 'our' ? 'opp' : 'our'
        const iWon = myRow.side === 'our'
          ? (ser.our_wins || 0) > (ser.opp_wins || 0)
          : (ser.opp_wins || 0) > (ser.our_wins || 0)
        ;(allSpaRows || [])
          .filter(r => r.series_id === myRow.series_id && r.side === oppSide && r.player_id !== playerRow.id)
          .forEach(opp => {
            if (!h2hMap[opp.gamertag]) h2hMap[opp.gamertag] = { gamertag: opp.gamertag, display_name: opp.display_name, wins: 0, losses: 0 }
            if (iWon) h2hMap[opp.gamertag].wins++
            else h2hMap[opp.gamertag].losses++
          })
      })
      const h2hList = Object.values(h2hMap)
        .filter(r => r.wins + r.losses >= 1)
        .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))
        .slice(0, 8)
      setH2h(h2hList)
    }
    } catch (err) {
      setLoadError(err.message)
    }
    setLoading(false)
  }

  function getRank(key, reverse = false) {
    if (!career || !allCareers.length) return null
    const sorted = [...allCareers]
      .filter(p => Number(p[key]) > 0)
      .sort((a, b) => reverse ? Number(a[key]) - Number(b[key]) : Number(b[key]) - Number(a[key]))
    const idx = sorted.findIndex(p => p.gamertag === gamertag)
    return idx >= 0 ? idx + 1 : null
  }

  function copyShareLink() {
    navigator.clipboard.writeText(`${window.location.origin}/player/${gamertag}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div style={s.page}>
      <div style={s.loadWrap}><IconBall size={20} color={OR} /><p style={s.dim}>Loading...</p></div>
    </div>
  )

  if (loadError) return (
    <div style={s.page}>
      <div style={s.loadWrap}><p style={s.dim}>Error loading profile: {loadError}</p></div>
    </div>
  )
  if (!player) return (
    <div style={s.page}>
      <div style={s.loadWrap}><p style={s.dim}>Player not found.</p></div>
    </div>
  )

  const name = player.display_name || player.gamertag || ''
  const initial = name?.[0]?.toUpperCase() || '?'
  const eliteCount = career?.elite_count || 0
  const mvpCount = career?.mvp_count || 0
  const gTierCount = career?.g_tier_count || 0
  const ppgRank = getRank('career_ppg')
  const apgRank = getRank('career_apg')
  const rpgRank = getRank('career_rpg')
  const eliteRank = getRank('elite_count')

  const statLine = [
    { label: 'PPG', val: career?.career_ppg, color: OR, rank: ppgRank },
    { label: 'APG', val: career?.career_apg, color: '#60a5fa', rank: apgRank },
    { label: 'RPG', val: career?.career_rpg, color: '#a78bfa', rank: rpgRank },
    { label: 'SPG', val: career?.career_spg, color: '#06b6d4', rank: null },
    { label: 'FG%', val: career?.career_fg_pct, color: colors.statGreen, rank: null, suffix: '%' },
    { label: '3P%', val: career?.career_3p_pct, color: colors.gold, rank: null, suffix: '%' },
  ]

  return (
    <div style={s.page}>
      {/* Back */}
      <div style={s.topBar}>
        <button onClick={() => navigate(-1)} style={s.backBtn}>
          <IconArrow size={15} color="#666" dir="left" />
        </button>
        <button onClick={copyShareLink} style={s.shareBtn}>
          {copied ? 'Copied!' : 'Share Profile'}
        </button>
      </div>

      {/* Hero */}
      <div style={s.hero} ref={shareRef}>
        <div style={s.avatar}>{initial}</div>
        <div>
          <div style={s.heroName}>{name.toUpperCase()}</div>
          {player.display_name && player.display_name !== player.gamertag &&
            <div style={s.heroTag}>{player.gamertag}</div>
          }
          <div style={s.heroMeta}>{career?.total_gp || 0} GP · {rankings.length} Series</div>
        </div>
        {isOwnProfile && <div style={s.youBadge}>YOU</div>}
      </div>

      {/* Accolade badges */}
      {(eliteCount > 0 || mvpCount > 0 || gTierCount > 0) && (
        <div style={s.badges}>
          {eliteCount > 0 && (
            <div style={s.badge}>
              <IconTrophy size={11} color={colors.elite} />
              <span style={{ color: colors.elite }}>{eliteCount}× ELITE</span>
            </div>
          )}
          {mvpCount > 0 && (
            <div style={s.badge}>
              <IconStar size={11} color={colors.gold} filled />
              <span style={{ color: colors.gold }}>{mvpCount}× MVP</span>
            </div>
          )}
          {gTierCount > 0 && (
            <div style={{ ...s.badge, background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <span style={{ background: RAINBOW, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800, fontSize: '0.72rem' }}>{gTierCount}× G TIER</span>
            </div>
          )}
        </div>
      )}

      {/* Career stat line */}
      <div style={s.section}>
        <div style={s.sectionLabel}>CAREER AVERAGES</div>
        <div style={s.statGrid}>
          {statLine.map(st => (
            <div key={st.label} style={s.statBox}>
              <div style={{ ...s.statVal, color: st.color }}>
                {st.val != null ? `${Number(st.val).toFixed(1)}${st.suffix || ''}` : '—'}
              </div>
              <div style={s.statLabel}>{st.label}</div>
              {st.rank === 1 && <div style={s.rankBadge}>#1 ALL-TIME</div>}
              {st.rank === 2 && <div style={{ ...s.rankBadge, background: 'rgba(170,170,170,0.12)', color: '#aaa' }}>#2</div>}
              {st.rank === 3 && <div style={{ ...s.rankBadge, background: 'rgba(205,127,50,0.12)', color: '#cd7f32' }}>#3</div>}
            </div>
          ))}
        </div>
      </div>

      {/* All-time ranking callouts */}
      {(ppgRank <= 3 || eliteRank <= 3) && (
        <div style={s.section}>
          <div style={s.sectionLabel}>ALL-TIME RANKINGS</div>
          <div style={s.rankRow}>
            {ppgRank && <div style={s.rankChip}><span style={{ color: OR }}>#{ppgRank}</span> PPG All-Time</div>}
            {apgRank && apgRank <= 3 && <div style={s.rankChip}><span style={{ color: '#60a5fa' }}>#{apgRank}</span> APG All-Time</div>}
            {rpgRank && rpgRank <= 3 && <div style={s.rankChip}><span style={{ color: '#a78bfa' }}>#{rpgRank}</span> RPG All-Time</div>}
            {eliteRank && eliteRank <= 3 && <div style={s.rankChip}><span style={{ color: colors.elite }}>#{eliteRank}</span> ELITE All-Time</div>}
          </div>
        </div>
      )}

      {/* Best games */}
      {bestGames.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionLabel}>BEST GAMES</div>
          <div style={s.gameList}>
            {bestGames.map((g, i) => (
              <div key={g.id} style={s.gameRow}>
                <span style={{ ...s.gameRank, color: i === 0 ? colors.gold : '#555' }}>#{i + 1}</span>
                <div style={s.gameStats}>
                  <span style={{ color: OR, fontWeight: 800 }}>{g.pts} PTS</span>
                  <span style={s.gameStat}>{g.reb} REB</span>
                  <span style={s.gameStat}>{g.ast} AST</span>
                  {g.stl > 0 && <span style={s.gameStat}>{g.stl} STL</span>}
                  {g.fga > 0 && <span style={{ ...s.gameStat, color: colors.statGreen }}>{g.fgm}/{g.fga} FG</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tier timeline with stat lines */}
      {rankings.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionLabel}>SERIES HISTORY</div>
          <div style={s.timeline}>
            {rankings.map((r) => {
              const ser = r.series
              const tc = TIER_COLOR[r.tier] || '#555'
              const spa = seriesStats[r.series_id || ser?.id]
              return (
                <Link key={r.id} to={ser ? `/series/${ser.id}` : '#'} style={s.timelineRow}>
                  <div style={{ ...s.tierDot, background: tc, boxShadow: `0 0 6px ${tc}` }} />
                  <div style={s.timelineBody}>
                    <div style={s.timelineName}>{ser?.name || 'Series'}</div>
                    <div style={s.timelineMeta}>
                      {r.is_mvp && <span style={s.mvpTag}>MVP</span>}
                      {r.tags?.length > 0 && r.tags.slice(0, 2).map(t => (
                        <span key={t} style={s.tag}>{t}</span>
                      ))}
                      {spa && (
                        <span style={s.spaLine}>
                          {spa.ppg} PPG · {spa.rpg} RPG · {spa.apg} APG
                          {spa.fg_pct != null && ` · ${spa.fg_pct}% FG`}
                          {spa.gp > 1 && ` · ${spa.gp}G`}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ ...s.tierLabel, color: tc }}>{TIER_LABEL[r.tier] || r.tier}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* H2H Rivalries */}
      {h2h.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionLabel}>HEAD TO HEAD</div>
          <div style={s.h2hGrid}>
            {h2h.map(opp => {
              const total = opp.wins + opp.losses
              const winPct = Math.round((opp.wins / total) * 100)
              const isUp = opp.wins >= opp.losses
              return (
                <Link key={opp.gamertag} to={`/player/${opp.gamertag}`} style={s.h2hCard}>
                  <div style={s.h2hAvatar}>{(opp.display_name || opp.gamertag)[0].toUpperCase()}</div>
                  <div style={s.h2hBody}>
                    <div style={s.h2hName}>{(opp.display_name || opp.gamertag).toUpperCase()}</div>
                    <div style={s.h2hRecord}>
                      <span style={{ color: isUp ? colors.statGreen : colors.gTier, fontWeight: 900 }}>{opp.wins}W</span>
                      <span style={{ color: '#333' }}>–</span>
                      <span style={{ color: isUp ? '#555' : colors.gTier, fontWeight: 700 }}>{opp.losses}L</span>
                      <span style={{ color: '#333', fontSize: '0.65rem' }}>{winPct}%</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Feed link */}
      <div style={s.section}>
        <Link to={`/feed`} style={s.feedLink}>
          <IconChat size={13} color={OR} />
          <span>Talk about {name} in the Crew Feed</span>
        </Link>
      </div>

      <div style={{ height: 80 }} />
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', fontFamily: fonts.display, paddingBottom: 80 },
  loadWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 8px' },
  backBtn: { background: 'none', border: '1px solid #1a1a1a', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#666' },
  shareBtn: { background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 6, color: '#666', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: "'Barlow Condensed', system-ui, sans-serif", textTransform: 'uppercase' },
  hero: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px 16px', position: 'relative' },
  avatar: { width: 60, height: 60, borderRadius: '50%', background: `linear-gradient(135deg, ${OR}, #7c3aed)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '1.8rem', color: '#000', flexShrink: 0 },
  heroName: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '1.6rem', letterSpacing: '0.1em', lineHeight: 1 },
  heroTag: { color: '#555', fontSize: '0.78rem', letterSpacing: '0.06em', marginTop: 2 },
  heroMeta: { color: '#444', fontSize: '0.72rem', letterSpacing: '0.06em', marginTop: 4 },
  youBadge: { position: 'absolute', top: 12, right: 16, background: OR, color: '#000', fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.12em', padding: '0.15rem 0.5rem', borderRadius: 3, fontFamily: "'Barlow Condensed', system-ui, sans-serif" },
  badges: { display: 'flex', gap: 8, padding: '0 16px 16px', flexWrap: 'wrap' },
  badge: { display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)', borderRadius: 6, padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', fontFamily: "'Barlow Condensed', system-ui, sans-serif", textTransform: 'uppercase' },
  section: { padding: '0 16px 20px' },
  sectionLabel: { color: NEON_P, fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10, fontFamily: "'Barlow Condensed', system-ui, sans-serif" },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: '#111', borderRadius: 10, overflow: 'hidden', border: '1px solid #1a1a1a' },
  statBox: { background: '#000', padding: '14px 10px', textAlign: 'center', position: 'relative' },
  statVal: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '1.6rem', lineHeight: 1, letterSpacing: '0.02em' },
  statLabel: { color: '#444', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 3 },
  rankBadge: { background: 'rgba(244,112,27,0.12)', color: OR, fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.08em', padding: '1px 4px', borderRadius: 3, marginTop: 3, display: 'inline-block', fontFamily: "'Barlow Condensed', system-ui, sans-serif" },
  rankRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  rankChip: { background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 6, padding: '6px 10px', fontSize: '0.75rem', color: '#666', fontWeight: 600, display: 'flex', gap: 5, alignItems: 'center' },
  gameList: { display: 'flex', flexDirection: 'column', gap: 6 },
  gameRow: { display: 'flex', alignItems: 'center', gap: 10, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, padding: '10px 12px' },
  gameRank: { fontSize: '0.75rem', fontWeight: 900, minWidth: 20, fontFamily: "'Barlow Condensed', system-ui, sans-serif" },
  gameStats: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  gameStat: { color: '#555', fontSize: '0.8rem', fontWeight: 600 },
  timeline: { display: 'flex', flexDirection: 'column', gap: 1 },
  timelineRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#0a0a0a', borderBottom: '1px solid #0f0f0f', textDecoration: 'none', color: 'inherit' },
  tierDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  timelineBody: { flex: 1 },
  timelineName: { color: '#ccc', fontSize: '0.82rem', fontWeight: 600, fontFamily: "'Barlow Condensed', system-ui, sans-serif", letterSpacing: '0.04em', textTransform: 'uppercase' },
  timelineMeta: { display: 'flex', gap: 5, marginTop: 2, flexWrap: 'wrap' },
  tierLabel: { fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', fontFamily: "'Barlow Condensed', system-ui, sans-serif", textTransform: 'uppercase', flexShrink: 0 },
  mvpTag: { background: 'rgba(234,179,8,0.12)', color: colors.gold, fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', padding: '1px 5px', borderRadius: 3, fontFamily: "'Barlow Condensed', system-ui, sans-serif" },
  tag: { background: '#111', color: '#444', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 3 },
  feedLink: { display: 'flex', alignItems: 'center', gap: 8, color: OR, textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(244,112,27,0.06)', border: '1px solid rgba(244,112,27,0.15)', borderRadius: 8, padding: '12px 14px', fontFamily: "'Barlow Condensed', system-ui, sans-serif", textTransform: 'uppercase' },
  spaLine: { color: '#444', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.03em' },
  h2hGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  h2hCard: { display: 'flex', alignItems: 'center', gap: 10, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, padding: '10px 12px', textDecoration: 'none', color: 'inherit' },
  h2hAvatar: { width: 32, height: 32, borderRadius: '50%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 900, fontSize: '1rem', color: '#555', flexShrink: 0 },
  h2hBody: { flex: 1, minWidth: 0 },
  h2hName: { fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.06em', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  h2hRecord: { display: 'flex', gap: 5, alignItems: 'baseline', marginTop: 2, fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '0.85rem' },
  dim: { color: '#444', fontSize: '0.85rem' },
}
