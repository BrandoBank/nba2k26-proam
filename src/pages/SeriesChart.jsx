import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { supabase } from '../lib/supabase'
import { colors, statColor } from '../lib/theme'
import { IconStar, IconArrow } from '../lib/icons'

const TIER_META = {
  ELITE:  { label: 'ELITE TIER — SERIES-DEFINING IMPACT',      spine: '#9333ea', bg: 'rgba(147,51,234,0.07)',  text: '#c084fc' },
  STRONG: { label: 'STRONG TIER — ELITE SPECIALISTS OR CONSISTENT CONTRIBUTORS', spine: '#2563eb', bg: 'rgba(37,99,235,0.07)',   text: '#60a5fa' },
  SOLID:  { label: 'SOLID TIER — RELIABLE ROLE PRODUCTION',    spine: '#16a34a', bg: 'rgba(22,163,74,0.07)',   text: '#4ade80' },
  G_TIER: { label: 'G TIER — NEGATIVE NET IMPACT',             spine: '#dc2626', bg: 'rgba(220,38,38,0.07)',   text: '#f87171' },
}

const TEAM_COLORS = { our: '#3b82f6', opp: '#ef4444' }

export default function SeriesChart() {
  const { id: seriesId } = useParams()
  const chartRef = useRef()
  const [series, setSeries] = useState(null)
  const [games, setGames] = useState([])
  const [rankings, setRankings] = useState([])
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { fetchAll() }, [seriesId])

  async function fetchAll() {
    const [{ data: ser }, { data: gms }, { data: rnk }, { data: sts }] = await Promise.all([
      supabase.from('series').select('*').eq('id', seriesId).single(),
      supabase.from('games').select('*').eq('series_id', seriesId).order('game_number'),
      supabase.from('series_rankings').select('*, players(gamertag,display_name,default_position)').eq('series_id', seriesId).order('tier').order('rank_in_tier'),
      supabase.from('series_player_stats').select('*').eq('series_id', seriesId),
    ])
    setSeries(ser)
    setGames(gms || [])
    setRankings(rnk || [])
    setStats(sts || [])
    setLoading(false)
  }

  async function handleExport() {
    if (!chartRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(chartRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: '#000' })
      const a = document.createElement('a')
      a.download = `${series?.name?.replace(/\s+/g, '-') || 'series'}-chart.png`
      a.href = dataUrl
      a.click()
    } catch (e) { console.error(e) }
    setExporting(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div style={pg.page}><p style={{ color: '#555' }}>Loading chart...</p></div>
  if (!series) return <div style={pg.page}><p style={{ color: '#555' }}>Series not found.</p></div>

  // Build stat lookup
  const statMap = {}
  stats.forEach(p => { statMap[p.player_id] = p })

  // Use rankings if available, otherwise sort by stats
  const hasRankings = rankings.length > 0
  const tierOrder = ['ELITE', 'STRONG', 'SOLID', 'G_TIER']

  // Group rows by tier
  const tierGroups = {}
  if (hasRankings) {
    rankings.forEach(r => {
      const t = r.tier
      if (!tierGroups[t]) tierGroups[t] = []
      tierGroups[t].push(r)
    })
  }

  const wins = games.filter(g => g.our_result === 'W').length
  const losses = games.filter(g => g.our_result === 'L').length
  const gameRange = games.length > 0 ? `G1–G${games[games.length - 1].game_number}` : ''

  return (
    <div style={pg.page}>
      {/* Controls */}
      <div style={pg.controls}>
        <Link to={`/series/${seriesId}`} style={pg.back}>← Series</Link>
        <div style={pg.ctrlRight}>
          <button onClick={copyLink} style={pg.btnGhost}>
            {copied ? '✓ Copied' : 'Copy Link'}
          </button>
          <button onClick={handleExport} disabled={exporting} style={pg.btnOrange}>
            {exporting ? 'Exporting...' : 'Download PNG'}
          </button>
        </div>
      </div>

      {/* THE CHART */}
      <div ref={chartRef} style={ch.chart}>

        {/* Header */}
        <div style={ch.header}>
          <div style={ch.headerLeft}>
            <span style={ch.headerApp}>NBA 2K26 PRO-AM</span>
            <span style={ch.headerDot}>·</span>
            <span style={ch.headerTeam}>{series.our_team_name}</span>
            <span style={ch.headerDot}>·</span>
            <span style={ch.headerSeries}>{series.name.toUpperCase()}</span>
            <span style={ch.headerDot}>·</span>
            <span style={ch.headerGames}>{gameRange}</span>
          </div>
          <div style={ch.headerRight}>
            SERIES: <span style={{ color: wins > losses ? colors.statGreen : colors.statRed, fontWeight: 900 }}>
              {wins}–{losses} {wins > losses ? 'W' : 'L'}
            </span>
          </div>
        </div>

        {/* Storyline banner */}
        {series.storyline && (
          <div style={ch.storyline}>
            {series.result_label && <span style={ch.storylinePill}>{series.result_label}</span>}
            <span style={ch.storylineText}>{series.storyline}</span>
          </div>
        )}

        {/* Game strip */}
        {games.length > 0 && (
          <div style={ch.gameStrip}>
            {games.map(g => (
              <div key={g.id} style={{ ...ch.gameCard, borderLeftColor: g.our_result === 'W' ? colors.statGreen : colors.statRed }}>
                <div style={ch.gameTop}>
                  <span style={ch.gameLabel}>G{g.game_number}</span>
                  <span style={{ color: g.our_result === 'W' ? colors.statGreen : colors.statRed, fontWeight: 800, fontSize: '0.75rem' }}>{g.our_result}</span>
                </div>
                <div style={ch.gameScore}>{g.our_score} — {g.opp_score}</div>
                <div style={ch.gameMargin}>{g.our_result === 'W' ? '+' : ''}{g.our_score - g.opp_score}</div>
                {g.brando_position && <div style={ch.gameBuild}>B: {g.brando_position}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Stat table */}
        <div style={ch.tableWrap}>
          {/* Column headers */}
          <div style={ch.colHeaders}>
            <div style={ch.colSpine} />
            <div style={{ ...ch.col, ...ch.colPlayer }}>PLAYER [TEAM]</div>
            {['PPG','RPG','APG','SPG','BPG','TO/G','FG%','3P%','BEST','GRD','TIER'].map(h => (
              <div key={h} style={{ ...ch.col, ...ch.colStat }}>{h}</div>
            ))}
            <div style={{ ...ch.col, flex: 1, fontSize: '0.6rem' }}>IMPACT NOTES</div>
          </div>

          {/* Tier rows */}
          {hasRankings ? (
            tierOrder.filter(t => tierGroups[t]?.length > 0).map(tier => {
              const meta = TIER_META[tier]
              return (
                <div key={tier}>
                  {/* Tier header */}
                  <div style={{ ...ch.tierHeader, color: meta.text }}>
                    {meta.label}
                  </div>
                  {/* Player rows */}
                  {tierGroups[tier].map(r => {
                    const p = statMap[r.player_id] || {}
                    const gtag = r.players?.gamertag || ''
                    const side = r.primary_side
                    return (
                      <PlayerRow
                        key={r.id}
                        gtag={gtag}
                        displayName={r.players?.display_name}
                        side={side}
                        teamLabel={side === 'our' ? series.our_team_name?.slice(0, 6) : series.opp_team_name?.slice(0, 6)}
                        tier={tier}
                        tierMeta={meta}
                        isMvp={r.is_mvp}
                        tags={r.tags || []}
                        impactNote={r.impact_note}
                        stats={p}
                        seriesWon={wins > losses}
                        brandoGtag="BrandoBank"
                      />
                    )
                  })}
                </div>
              )
            })
          ) : (
            // No rankings yet — show all players sorted by PPG with no tiers
            <div>
              <div style={{ ...ch.tierHeader, color: '#555' }}>STATS — Rankings pending</div>
              {[...stats].sort((a,b) => b.ppg - a.ppg).map(p => (
                <PlayerRow
                  key={p.player_id}
                  gtag={p.gamertag}
                  displayName={p.display_name}
                  side={p.primary_side}
                  teamLabel={p.primary_side === 'our' ? series.our_team_name?.slice(0,6) : series.opp_team_name?.slice(0,6)}
                  tier={null}
                  tierMeta={{ spine: '#333', bg: 'transparent', text: '#555' }}
                  isMvp={false}
                  tags={[]}
                  impactNote=""
                  stats={p}
                  seriesWon={wins > losses}
                  brandoGtag="BrandoBank"
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer legend */}
        <div style={ch.footer}>
          <div style={ch.footerRow}>
            <span style={ch.footerItem}>
              <span style={{ color: TIER_META.ELITE.text }}>ELITE</span> series-defining
              <span style={ch.footerSep}>·</span>
              <span style={{ color: TIER_META.STRONG.text }}>STRONG</span> real two-way/specialist
              <span style={ch.footerSep}>·</span>
              <span style={{ color: TIER_META.SOLID.text }}>SOLID</span> reliable role
              <span style={ch.footerSep}>·</span>
              <span style={{ color: TIER_META.G_TIER.text }}>G TIER</span> low/negative impact
            </span>
          </div>
          <div style={ch.footerRow}>
            <span style={ch.footerItem}>
              COLOR: FG%/3P% <span style={{ color: colors.statGreen }}>●</span>≥60% <span style={{ color: colors.statGold }}>●</span>50–59% <span style={{ color: colors.statRed }}>●</span>&lt;50%
              <span style={ch.footerSep}>·</span>
              TO/G <span style={{ color: colors.statGreen }}>●</span>≤0.8 <span style={{ color: colors.statGold }}>●</span>0.9–1.9 <span style={{ color: colors.statRed }}>●</span>≥2.0
              <span style={ch.footerSep}>·</span>
              <IconStar size={10} color={colors.gold} filled /> = Series MVP
              <span style={ch.footerSep}>·</span>
              SWING = played both sides
              <span style={ch.footerSep}>·</span>
              GP:n = partial series
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayerRow({ gtag, displayName, side, teamLabel, tier, tierMeta, isMvp, tags, impactNote, stats, seriesWon, brandoGtag }) {
  const p = stats || {}
  const teamColor = TEAM_COLORS[side] || '#888'

  return (
    <div style={{ ...ch.row, background: tierMeta.bg }}>
      {/* Colored spine */}
      <div style={{ ...ch.spine, background: tierMeta.spine }} />

      {/* Player name + badges */}
      <div style={{ ...ch.col, ...ch.colPlayer }}>
        <div style={ch.playerName}>
          {isMvp && <IconStar size={11} color={colors.gold} filled />}
          <span style={{ marginLeft: isMvp ? 3 : 0 }}>{gtag}</span>
        </div>
        <div style={ch.playerBadges}>
          <span style={{ ...ch.teamBadge, background: `${teamColor}22`, color: teamColor, borderColor: `${teamColor}44` }}>
            {teamLabel}
          </span>
          {tags.map((tag, i) => (
            <span key={i} style={ch.tag}>{tag}</span>
          ))}
        </div>
      </div>

      {/* Stats */}
      <StatCell v={p.ppg} />
      <StatCell v={p.rpg} />
      <StatCell v={p.apg} type="apg" />
      <StatCell v={p.spg} type="spg" />
      <StatCell v={p.bpg} type="bpg" />
      <StatCell v={p.tovpg} type="tov" />
      <StatCell v={p.fg_pct} type="fg" suffix="%" />
      <StatCell v={p.three_pct} type="3p" suffix="%" />
      <StatCell v={p.best_pts} />
      <StatCell v={p.grade || '—'} raw />

      {/* Tier badge */}
      <div style={{ ...ch.col, ...ch.colStat }}>
        {tier ? (
          <span style={{ ...ch.tierBadge, color: tierMeta.text, borderColor: tierMeta.spine + '66' }}>
            {tier === 'G_TIER' ? 'G TIER' : tier}
          </span>
        ) : <span style={{ color: '#333' }}>—</span>}
      </div>

      {/* Impact notes */}
      <div style={{ ...ch.col, flex: 1, color: '#aaa', fontSize: '0.72rem', lineHeight: 1.45, padding: '0.5rem 0.75rem' }}>
        {impactNote || ''}
      </div>
    </div>
  )
}

function StatCell({ v, type, suffix = '', raw = false }) {
  if (raw) return <div style={{ ...ch.col, ...ch.colStat, color: '#ccc' }}>{v}</div>
  if (v === null || v === undefined || v === '') return <div style={{ ...ch.col, ...ch.colStat, color: '#333' }}>—</div>
  const color = statColor(v, type)
  const bold = color !== colors.textSecondary
  return (
    <div style={{ ...ch.col, ...ch.colStat, color, fontWeight: bold ? 700 : 400 }}>
      {v}{suffix}
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────

const pg = {
  page: { minHeight: '100vh', background: '#050505', padding: '1.5rem', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', maxWidth: 1200, margin: '0 auto 1.25rem' },
  back: { color: '#444', textDecoration: 'none', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 4 },
  ctrlRight: { display: 'flex', gap: '0.5rem' },
  btnGhost: { background: 'transparent', color: '#666', border: '1px solid #222', borderRadius: 6, padding: '0.45rem 1rem', fontSize: '0.82rem', cursor: 'pointer' },
  btnOrange: { background: colors.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' },
}

const ch = {
  chart: {
    background: '#000',
    maxWidth: 1200,
    margin: '0 auto',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    border: '1px solid #111',
    borderRadius: 8,
    overflow: 'hidden',
  },

  // Header
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#080808', borderBottom: '1px solid #111', flexWrap: 'wrap', gap: '0.5rem' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' },
  headerApp: { color: '#fff', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '0.12em' },
  headerDot: { color: '#333', fontSize: '0.7rem' },
  headerTeam: { color: colors.orange, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.08em' },
  headerSeries: { color: '#ccc', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.08em' },
  headerGames: { color: '#555', fontSize: '0.72rem' },
  headerRight: { color: '#888', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em' },

  // Storyline
  storyline: { background: '#080808', borderBottom: '1px solid #111', padding: '0.6rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' },
  storylinePill: { background: colors.orange, color: '#fff', fontSize: '0.62rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0, marginTop: 1 },
  storylineText: { color: '#ccc', fontSize: '0.78rem', lineHeight: 1.5 },

  // Game strip
  gameStrip: { display: 'flex', gap: 0, borderBottom: '1px solid #111', background: '#050505', overflowX: 'auto' },
  gameCard: { borderLeft: '3px solid', padding: '0.6rem 0.9rem', minWidth: 100, borderRight: '1px solid #0d0d0d' },
  gameTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' },
  gameLabel: { color: '#555', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em' },
  gameScore: { color: '#fff', fontWeight: 800, fontSize: '0.88rem', marginBottom: '0.1rem' },
  gameMargin: { color: '#444', fontSize: '0.68rem' },
  gameBuild: { color: '#333', fontSize: '0.65rem', marginTop: '0.2rem' },

  // Table
  tableWrap: { background: '#000' },
  colHeaders: { display: 'flex', alignItems: 'center', borderBottom: '1px solid #111', background: '#080808' },
  colSpine: { width: 3, flexShrink: 0, alignSelf: 'stretch' },
  col: { color: '#444', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '0.4rem 0.5rem', display: 'flex', alignItems: 'center' },
  colPlayer: { minWidth: 170, flex: '0 0 170px', flexDirection: 'column', alignItems: 'flex-start', gap: 0 },
  colStat: { minWidth: 46, justifyContent: 'center', textAlign: 'center' },

  // Tier
  tierHeader: { padding: '0.4rem 1rem', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', borderTop: '1px solid #111', borderBottom: '1px solid #111' },
  tierBadge: { fontSize: '0.58rem', fontWeight: 800, border: '1px solid', borderRadius: 3, padding: '0.1rem 0.35rem', letterSpacing: '0.06em' },

  // Row
  row: { display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)', minHeight: 48 },
  spine: { width: 3, flexShrink: 0, alignSelf: 'stretch' },

  // Player cell
  playerName: { display: 'flex', alignItems: 'center', color: '#fff', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.25rem', gap: 3 },
  playerBadges: { display: 'flex', gap: '0.25rem', flexWrap: 'wrap' },
  teamBadge: { fontSize: '0.58rem', fontWeight: 700, border: '1px solid', borderRadius: 3, padding: '0.1rem 0.4rem', letterSpacing: '0.05em' },
  tag: { fontSize: '0.55rem', fontWeight: 700, color: '#555', border: '1px solid #1e1e1e', borderRadius: 3, padding: '0.1rem 0.35rem', letterSpacing: '0.04em', textTransform: 'uppercase' },

  // Footer
  footer: { background: '#080808', borderTop: '1px solid #111', padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  footerRow: { display: 'flex', flexWrap: 'wrap', gap: '0.25rem' },
  footerItem: { color: '#444', fontSize: '0.62rem', display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' },
  footerSep: { color: '#222', margin: '0 0.2rem' },
}
