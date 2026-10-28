import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { colors, fonts, radius, statColor } from '../lib/theme'
import { IconTrophy, IconChart, IconArrow, IconStar, IconBall, IconFlame, IconTarget, IconPass, IconShield } from '../lib/icons'
import { computeAchievements, ACHIEVEMENT_CATALOGUE } from '../lib/achievements'
import { computeImpactScores } from '../lib/ranking'

// ─── Tier helpers ────────────────────────────────────────────────────────────

const TIER_ORDER = ['ELITE', 'STRONG', 'SOLID', 'G_TIER']

const TIER_META = {
  ELITE:  { label: 'E',  short: 'ELITE',  color: colors.elite,  bg: colors.eliteBg },
  STRONG: { label: 'S',  short: 'STR',    color: colors.strong, bg: colors.strongBg },
  SOLID:  { label: 'SO', short: 'SOLID',  color: colors.solid,  bg: colors.solidBg },
  G_TIER: { label: 'G',  short: 'G',      color: colors.gTier,  bg: colors.gTierBg },
}

const RAINBOW = 'linear-gradient(90deg,#f87171,#fb923c,#facc15,#4ade80,#60a5fa,#a78bfa,#f472b6)'

function TierBadge({ tier, size = 'sm' }) {
  const meta = TIER_META[tier]
  if (!meta) return null
  const isLarge = size === 'lg'
  const isG = tier === 'G_TIER'
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: isLarge ? 11 : 9,
      fontWeight: 800,
      letterSpacing: '0.04em',
      background: isG ? RAINBOW : meta.bg,
      border: isG ? 'none' : `1px solid ${meta.color}33`,
      borderRadius: radius.sm,
      padding: isG ? (isLarge ? '4px 9px' : '3px 6px') : (isLarge ? '3px 8px' : '2px 5px'),
      minWidth: isLarge ? 40 : 22,
      fontFamily: fonts.display,
      color: isG ? '#000' : meta.color,
    }}>
      {isLarge ? meta.short : meta.label}
    </span>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'leaders',      label: 'ALL-TIME LEADERS' },
  { id: 'log',          label: 'SERIES LOG' },
  { id: 'tracker',      label: 'TIER TRACKER' },
  { id: 'achievements', label: 'ACHIEVEMENTS' },
  { id: 'rivalries',    label: 'RIVALRIES' },
]

const ACHIEVEMENT_ICONS = {
  star:   (c) => <IconStar size={16} color={c} filled />,
  flame:  (c) => <IconFlame size={16} color={c} />,
  trophy: (c) => <IconTrophy size={16} color={c} />,
  target: (c) => <IconTarget size={16} color={c} />,
  pass:   (c) => <IconPass size={16} color={c} />,
  shield: (c) => <IconShield size={16} color={c} />,
  ball:   (c) => <IconBall size={16} color={c} />,
  chart:  (c) => <IconChart size={16} color={c} />,
}

// ─── Leaders tab columns ──────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'display_name', label: 'PLAYER',  numeric: false, colorType: null },
  { key: 'career_gp',    label: 'GP',      numeric: true,  colorType: null },
  { key: 'career_ppg',   label: 'PPG',     numeric: true,  colorType: null },
  { key: 'career_rpg',   label: 'RPG',     numeric: true,  colorType: null },
  { key: 'career_apg',   label: 'APG',     numeric: true,  colorType: 'apg' },
  { key: 'career_spg',   label: 'SPG',     numeric: true,  colorType: 'spg' },
  { key: 'career_bpg',   label: 'BPG',     numeric: true,  colorType: 'bpg' },
  { key: 'career_tovpg', label: 'TOV/G',   numeric: true,  colorType: 'tov' },
  { key: 'career_fg_pct',label: 'FG%',     numeric: true,  colorType: 'fg',  pct: true },
  { key: 'career_3p_pct',label: '3P%',     numeric: true,  colorType: '3p',  pct: true },
  { key: 'mvp_count',    label: 'MVPs',    numeric: true,  colorType: null },
  { key: 'elite_count',  label: 'ELITE',   numeric: true,  colorType: null },
  { key: 'strong_count', label: 'STRONG',  numeric: true,  colorType: null },
  { key: 'solid_count',  label: 'SOLID',   numeric: true,  colorType: null },
  { key: 'g_tier_count', label: 'G TIER',  numeric: true,  colorType: null },
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function History() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('leaders')

  // Data
  const [careerStats, setCareerStats] = useState([])
  const [seriesList, setSeriesList] = useState([])
  const [rankings, setRankings] = useState([])
  const [allSeriesStats, setAllSeriesStats] = useState([])
  const [h2hData, setH2hData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Leaders controls
  const [sortKey, setSortKey] = useState('career_ppg')
  const [sortDir, setSortDir] = useState('desc')
  const [minGP, setMinGP] = useState(3)

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      try {
        const [
          { data: career, error: e1 },
          { data: series, error: e2 },
          { data: rnk,    error: e3 },
          { data: h2h,    error: e4 },
          { data: sStats, error: e5 },
        ] = await Promise.all([
          supabase.from('career_player_totals').select('*'),
          supabase.from('series').select('*').eq('status', 'complete').order('ended_at', { ascending: false }),
          supabase.from('series_rankings').select('*, players(gamertag,display_name)'),
          supabase.from('player_head_to_head').select('*'),
          supabase.from('series_player_stats').select('*'),
        ])
        if (e1 || e2 || e3) throw new Error('Failed to load history data.')
        setCareerStats(career || [])
        setSeriesList(series || [])
        setRankings(rnk || [])
        setAllSeriesStats(sStats || [])
        setH2hData(h2h || [])
      } catch (err) {
        setError(err.message)
      }
      setLoading(false)
    }
    fetchAll()
  }, [])

  // ── Sorted leaders ──────────────────────────────────────────────────────────
  const sortedLeaders = useMemo(() => {
    let rows = careerStats.filter(p => (p.career_gp || 0) >= minGP)
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return rows
  }, [careerStats, sortKey, sortDir, minGP])

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // ── Computed achievements ───────────────────────────────────────────────────
  const achievements = useMemo(() => {
    if (!careerStats.length && !rankings.length) return []
    return computeAchievements(careerStats, rankings)
  }, [careerStats, rankings])

  // ── Tier tracker data ───────────────────────────────────────────────────────
  const { trackerPlayers, trackerSeries, trackerMap } = useMemo(() => {
    const trackerSeries = [...seriesList].sort((a, b) =>
      (a.ended_at || '').localeCompare(b.ended_at || '')
    )

    // Series that have finalized rankings
    const finalRankings = rankings.filter(r => r.finalized)
    const finalizedSeriesIds = new Set(finalRankings.map(r => r.series_id))

    // Auto-compute tiers for series without finalized rankings
    const autoRankings = []
    const statsBySeries = {}
    for (const s of allSeriesStats) {
      if (!statsBySeries[s.series_id]) statsBySeries[s.series_id] = []
      statsBySeries[s.series_id].push(s)
    }
    for (const [seriesId, stats] of Object.entries(statsBySeries)) {
      if (finalizedSeriesIds.has(seriesId)) continue
      const computed = computeImpactScores(stats)
      for (const r of computed) {
        autoRankings.push({ ...r, series_id: seriesId, auto: true })
      }
    }

    const allRankings = [
      ...finalRankings.map(r => ({
        player_id: r.player_id,
        gamertag: r.players?.gamertag || r.gamertag || '',
        display_name: r.players?.display_name || r.display_name || r.players?.gamertag || r.gamertag || '',
        series_id: r.series_id,
        tier: r.tier,
      })),
      ...autoRankings,
    ]

    const playerMap = {}
    for (const r of allRankings) {
      if (!playerMap[r.player_id]) {
        playerMap[r.player_id] = { player_id: r.player_id, gamertag: r.gamertag || '', display_name: r.display_name || r.gamertag || '' }
      }
    }
    const trackerPlayers = Object.values(playerMap).sort((a, b) =>
      (a.display_name || '').localeCompare(b.display_name || '')
    )
    const trackerMap = {}
    for (const r of allRankings) {
      if (!trackerMap[r.player_id]) trackerMap[r.player_id] = {}
      if (!trackerMap[r.player_id][r.series_id]) {
        trackerMap[r.player_id][r.series_id] = { tier: r.tier, auto: r.auto || false }
      }
    }
    return { trackerPlayers, trackerSeries, trackerMap }
  }, [seriesList, rankings, allSeriesStats])

  if (loading) return (
    <div style={s.page}>
      <p style={s.dim}>Loading history...</p>
    </div>
  )

  if (error) return (
    <div style={s.page}>
      <p style={{ color: colors.statRed, padding: 24 }}>{error}</p>
    </div>
  )

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={s.backBtn}>
            <IconArrow size={16} color={colors.textSecondary} dir="left" />
          </button>
          <div>
            <div style={s.pageTitle}>HISTORY</div>
            <div style={s.pageSub}>All-time records and series archive</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...s.tab, ...(tab === t.id ? s.tabActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'leaders' && (
        <LeadersTab
          rows={sortedLeaders}
          sortKey={sortKey}
          sortDir={sortDir}
          minGP={minGP}
          onSort={handleSort}
          onMinGPChange={setMinGP}
        />
      )}
      {tab === 'log' && (
        <SeriesLogTab series={seriesList} rankings={rankings} />
      )}
      {tab === 'tracker' && (
        <TierTrackerTab
          players={trackerPlayers}
          series={trackerSeries}
          map={trackerMap}
        />
      )}
      {tab === 'achievements' && (
        <AchievementsTab achievements={achievements} />
      )}
      {tab === 'rivalries' && (
        <RivalriesTab h2h={h2hData} />
      )}
    </div>
  )
}

// ─── ALL-TIME LEADERS TAB ─────────────────────────────────────────────────────

function LeadersTab({ rows, sortKey, sortDir, minGP, onSort, onMinGPChange }) {
  return (
    <div style={s.tabContent}>
      {/* Controls */}
      <div style={s.controls}>
        <div style={s.controlGroup}>
          <label style={s.controlLabel}>Min GP</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 3, 5, 10].map(n => (
              <button
                key={n}
                onClick={() => onMinGPChange(n)}
                style={{ ...s.filterBtn, ...(minGP === n ? s.filterBtnActive : {}) }}
              >
                {n}+
              </button>
            ))}
          </div>
        </div>
        <div style={s.controlNote}>{rows.length} players</div>
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.thRank}>#</th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  style={{ ...s.th, ...(col.numeric ? s.thNum : {}), ...(sortKey === col.key ? s.thActive : {}) }}
                  onClick={() => onSort(col.key)}
                >
                  <span style={s.thInner}>
                    {col.label}
                    {sortKey === col.key && (
                      <IconArrow size={10} color={colors.orange} dir={sortDir === 'desc' ? 'down' : 'up'} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} style={s.emptyCell}>No players meet the filter.</td>
              </tr>
            )}
            {rows.map((p, i) => (
              <tr key={p.player_id || i} style={s.tr}>
                <td style={s.tdRank}>{i + 1}</td>
                {COLUMNS.map(col => {
                  const raw = p[col.key]
                  const display = col.pct
                    ? raw != null ? `${(raw * 100).toFixed(1)}%` : '—'
                    : raw != null ? (typeof raw === 'number' ? raw.toFixed(col.key.includes('pct') ? 1 : 1) : raw) : '—'
                  const cellColor = col.colorType
                    ? statColor(col.pct ? (raw || 0) * 100 : raw, col.colorType)
                    : col.key === 'display_name' ? colors.textPrimary : colors.textSecondary
                  return (
                    <td
                      key={col.key}
                      style={{
                        ...s.td,
                        ...(col.numeric ? s.tdNum : {}),
                        color: cellColor,
                        fontWeight: col.key === 'display_name' ? 700 : 400,
                      }}
                    >
                      {display}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── SERIES LOG TAB ───────────────────────────────────────────────────────────

function SeriesLogTab({ series, rankings }) {
  // Build MVP map: series_id -> mvp gamertag
  const mvpMap = useMemo(() => {
    const m = {}
    for (const r of rankings) {
      if (r.is_mvp) m[r.series_id] = r.display_name || r.gamertag
    }
    return m
  }, [rankings])

  // Build draft frequency
  const draftStats = useMemo(() => {
    const counts = {}
    for (const ser of series) {
      if (!ser.drafted_by) continue
      if (!counts[ser.drafted_by]) counts[ser.drafted_by] = { name: ser.drafted_by, count: 0, lastAt: null }
      counts[ser.drafted_by].count++
      if (!counts[ser.drafted_by].lastAt || ser.created_at > counts[ser.drafted_by].lastAt) {
        counts[ser.drafted_by].lastAt = ser.created_at
      }
    }
    return Object.values(counts).sort((a, b) => b.count - a.count)
  }, [series])

  // Who should draft next — least recent drafter with fewest drafts
  const nextDrafter = useMemo(() => {
    if (draftStats.length === 0) return null
    const minCount = Math.min(...draftStats.map(d => d.count))
    const candidates = draftStats.filter(d => d.count === minCount)
    // Among tied candidates, pick the one who drafted least recently
    candidates.sort((a, b) => (a.lastAt || '').localeCompare(b.lastAt || ''))
    return candidates[0]
  }, [draftStats])

  return (
    <div style={s.tabContent}>
      {/* Draft rotation widget */}
      {draftStats.length > 0 && (
        <div style={s.draftWrap}>
          <div style={s.draftHeader}>
            <span style={s.draftTitle}>🎯 DRAFT ROTATION</span>
            {nextDrafter && (
              <span style={s.draftNext}>Next up: <strong style={{ color: colors.orange }}>{nextDrafter.name}</strong></span>
            )}
          </div>
          <div style={s.draftGrid}>
            {draftStats.map((d, i) => (
              <div key={d.name} style={{ ...s.draftCard, ...(i === 0 ? s.draftCardTop : {}) }}>
                <span style={s.draftRank}>#{i + 1}</span>
                <span style={s.draftName}>{d.name}</span>
                <span style={s.draftCount}>{d.count} draft{d.count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {series.length === 0 && (
        <div style={s.empty}>
          <p style={s.dim}>No completed series yet.</p>
        </div>
      )}
      <div style={s.logList}>
        {series.map(ser => {
          const resultLabel = ser.result_label || `${ser.our_wins || 0}–${ser.opp_wins || 0}`
          const resultColor = '#aaa'
          const mvp = mvpMap[ser.id]
          const date = ser.ended_at
            ? new Date(ser.ended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : null

          return (
            <Link to={`/series/${ser.id}`} key={ser.id} style={s.logCard}>
              <div style={s.logCardInner}>
                <div style={s.logLeft}>
                  <div style={s.logName}>{ser.name || 'Untitled Series'}</div>
                  <div style={s.logTeams}>
                    <span style={{ color: '#aaa' }}>{ser.our_team_name || 'Team A'}</span>
                    <span style={s.logVs}>vs</span>
                    <span style={{ color: '#aaa' }}>{ser.opp_team_name || 'Team B'}</span>
                  </div>
                  {mvp && (
                    <div style={s.logMvp}>
                      <IconTrophy size={12} color={colors.gold} />
                      <span style={{ color: colors.gold }}>MVP: {mvp}</span>
                    </div>
                  )}
                  {ser.drafted_by && (
                    <div style={s.logDraft}>🎯 Drafted by {ser.drafted_by}</div>
                  )}
                </div>
                <div style={s.logRight}>
                  <div style={{ ...s.logResult, color: resultColor }}>{resultLabel}</div>
                  {date && <div style={s.logDate}>{date}</div>}
                  <IconArrow size={14} color={colors.textMuted} dir="right" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─── TIER TRACKER TAB ────────────────────────────────────────────────────────

function TierTrackerTab({ players, series, map }) {
  if (players.length === 0 || series.length === 0) {
    return (
      <div style={s.tabContent}>
        <p style={s.dim}>No ranking data yet.</p>
      </div>
    )
  }

  return (
    <div style={s.tabContent}>
      <p style={s.trackerNote}>
        Each cell shows finishing tier per series. Bright = finalized by editor · Dim = auto-computed from stats.
      </p>
      <div style={s.trackerWrap}>
        <table style={s.trackerTable}>
          <thead>
            <tr>
              <th style={s.trackerTh}>PLAYER</th>
              {series.map((ser, i) => (
                <th key={ser.id} style={s.trackerThSeries}>
                  <div style={s.trackerSeriesLabel}>S{i + 1}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p.player_id} style={s.tr}>
                <td style={s.trackerPlayerCell}>
                  {p.display_name || p.gamertag}
                </td>
                {series.map(ser => {
                  const entry = map[p.player_id]?.[ser.id]
                  const tier = entry?.tier
                  const auto = entry?.auto
                  return (
                    <td key={ser.id} style={s.trackerCell}>
                      {tier
                        ? <span style={{ opacity: auto ? 0.55 : 1 }}><TierBadge tier={tier} size="sm" /></span>
                        : <span style={s.trackerEmpty}>–</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── ACHIEVEMENTS TAB ────────────────────────────────────────────────────────

function AchievementsTab({ achievements }) {
  if (achievements.length === 0) {
    return (
      <div style={s.tabContent}>
        <p style={s.dim}>No achievements earned yet. Play more series.</p>
      </div>
    )
  }

  // Group by player
  const byPlayer = {}
  for (const a of achievements) {
    const key = a.gamertag
    if (!byPlayer[key]) byPlayer[key] = { gamertag: key, positive: [], negative: [] }
    if (a.type === 'negative') byPlayer[key].negative.push(a)
    else byPlayer[key].positive.push(a)
  }
  const players = Object.values(byPlayer).sort((a, b) =>
    (b.positive.length + b.negative.length) - (a.positive.length + a.negative.length)
  )

  return (
    <div style={s.tabContent}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {players.map(p => (
          <div key={p.gamertag} style={s.achCard}>
            <div style={s.achHeader}>
              <span style={s.achName}>{p.gamertag}</span>
              <span style={s.achCount}>{p.positive.length + p.negative.length} badge{p.positive.length + p.negative.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={s.achBadges}>
              {p.positive.map(a => (
                <div key={a.achievement} style={{ ...s.achBadge, ...s.achBadgePos }} title={a.description}>
                  <span style={s.achBadgeIcon}>
                    {ACHIEVEMENT_ICONS[a.icon_key]?.(colors.orange) || '🏆'}
                  </span>
                  <span style={s.achBadgeLabel}>{a.label}</span>
                </div>
              ))}
              {p.negative.map(a => (
                <div key={a.achievement} style={{ ...s.achBadge, ...s.achBadgeNeg }} title={a.description}>
                  <span style={s.achBadgeIcon}>
                    {ACHIEVEMENT_ICONS[a.icon_key]?.(colors.gTier) || '💀'}
                  </span>
                  <span style={{ ...s.achBadgeLabel, color: colors.gTier }}>{a.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── RIVALRIES TAB ───────────────────────────────────────────────────────────

function RivalriesTab({ h2h }) {
  const [focusPlayer, setFocusPlayer] = useState('')

  if (h2h.length === 0) {
    return (
      <div style={s.tabContent}>
        <p style={s.dim}>No head-to-head records yet. Rivalries form after series with cross-team matchups.</p>
      </div>
    )
  }

  // Build unique player list from all entries
  const playerSet = new Set()
  for (const row of h2h) {
    playerSet.add(row.player_a)
    playerSet.add(row.player_b)
  }
  const players = [...playerSet].sort()

  // Filter to pairings involving focusPlayer (or show all)
  const filtered = focusPlayer
    ? h2h.filter(r => r.player_a === focusPlayer || r.player_b === focusPlayer)
    : h2h

  // Deduplicate: keep only A < B alphabetically to avoid showing both A vs B and B vs A
  const seen = new Set()
  const deduped = filtered.filter(r => {
    const key = [r.player_a, r.player_b].sort().join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort by total games played desc
  const sorted = [...deduped].sort((a, b) => (b.games_shared || 0) - (a.games_shared || 0))

  return (
    <div style={s.tabContent}>
      {/* Player filter */}
      <div style={s.controls}>
        <div style={s.controlGroup}>
          <label style={s.controlLabel}>Player</label>
          <select
            value={focusPlayer}
            onChange={e => setFocusPlayer(e.target.value)}
            style={s.selectInput}
          >
            <option value="">All Rivalries</option>
            {players.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {sorted.length === 0 && (
        <p style={s.dim}>No records for this player yet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((row, i) => {
          const pA = row.player_a
          const pB = row.player_b
          const winsA = row.player_a_wins || 0
          const winsB = row.player_a_losses || 0
          const total = row.games_shared || 0
          const pctA = total > 0 ? winsA / total : 0.5
          const dominant = winsA > winsB ? pA : winsB > winsA ? pB : null

          return (
            <div key={i} style={s.rivalCard}>
              <div style={s.rivalPlayers}>
                <span style={{ ...s.rivalName, color: winsA > winsB ? colors.orange : colors.textSecondary }}>{pA}</span>
                <span style={s.rivalVs}>VS</span>
                <span style={{ ...s.rivalName, color: winsB > winsA ? colors.orange : colors.textSecondary }}>{pB}</span>
              </div>
              {/* Win bar */}
              <div style={s.rivalBar}>
                <div style={{ ...s.rivalBarFill, width: `${pctA * 100}%`, background: colors.orange }} />
              </div>
              <div style={s.rivalRecord}>
                <span style={s.rivalWins}>{winsA}W</span>
                <span style={s.rivalGP}>{total} games</span>
                <span style={s.rivalWins}>{winsB}W</span>
              </div>
              {dominant && (
                <div style={s.rivalDominant}>
                  {dominant} leads this rivalry
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight: '100vh',
    background: colors.bg,
    color: colors.textPrimary,
    fontFamily: fonts.display,
    paddingBottom: 48,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 20px 16px',
    borderBottom: `1px solid ${colors.border}`,
  },
  backBtn: {
    background: 'none',
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    padding: '6px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    color: colors.textSecondary,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: '0.08em',
    color: colors.textPrimary,
  },
  pageSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  tabBar: {
    display: 'flex',
    borderBottom: `1px solid ${colors.border}`,
    overflowX: 'auto',
    padding: '0 20px',
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '12px 16px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: colors.textMuted,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: fonts.display,
    transition: 'color 0.15s',
  },
  tabActive: {
    color: colors.orange,
    borderBottomColor: colors.orange,
  },
  tabContent: {
    padding: '20px',
  },
  dim: {
    color: colors.textMuted,
    fontSize: 13,
    padding: '32px 20px',
  },
  empty: {
    textAlign: 'center',
    padding: '48px 20px',
  },

  // Controls
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  controlNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 'auto',
  },
  filterBtn: {
    background: 'none',
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: fonts.display,
  },
  filterBtnActive: {
    background: colors.orangeGlow,
    border: `1px solid ${colors.orange}`,
    color: colors.orange,
  },

  // Table
  tableWrap: {
    overflowX: 'auto',
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  thRank: {
    padding: '10px 12px',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.06em',
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    width: 32,
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.06em',
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  thNum: {
    textAlign: 'right',
  },
  thActive: {
    color: colors.orange,
  },
  thInner: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  tr: {
    borderBottom: `1px solid ${colors.border}`,
  },
  tdRank: {
    padding: '10px 12px',
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
  },
  td: {
    padding: '10px 12px',
    fontSize: 13,
    color: colors.textSecondary,
    whiteSpace: 'nowrap',
  },
  tdNum: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  emptyCell: {
    padding: '32px',
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
  },

  // Series log
  logList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  logCard: {
    display: 'block',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    textDecoration: 'none',
    color: 'inherit',
    transition: 'border-color 0.15s',
  },
  logCardInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    gap: 12,
  },
  logLeft: {
    flex: 1,
    minWidth: 0,
  },
  logName: {
    fontSize: 15,
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  logTeams: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    marginBottom: 4,
  },
  logVs: {
    color: colors.textMuted,
    fontSize: 11,
  },
  logMvp: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: colors.gold,
    marginTop: 2,
  },
  logDraft: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Draft rotation
  draftWrap: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: '12px 16px',
    marginBottom: 16,
  },
  draftHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  draftTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: colors.textMuted,
  },
  draftNext: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  draftGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  draftCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    padding: '4px 10px',
    fontSize: 12,
  },
  draftCardTop: {
    borderColor: `${colors.orange}55`,
    background: `${colors.orange}08`,
  },
  draftRank: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: 700,
  },
  draftName: {
    fontWeight: 700,
    color: colors.textPrimary,
  },
  draftCount: {
    fontSize: 11,
    color: colors.textMuted,
  },
  logRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  logResult: {
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: '0.04em',
  },
  logDate: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: '0.04em',
  },

  // Tier tracker
  trackerNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 16,
    letterSpacing: '0.04em',
  },
  trackerWrap: {
    overflowX: 'auto',
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
  },
  trackerTable: {
    borderCollapse: 'collapse',
    fontSize: 12,
    minWidth: '100%',
  },
  trackerTh: {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: colors.textMuted,
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    whiteSpace: 'nowrap',
    minWidth: 120,
    position: 'sticky',
    left: 0,
    zIndex: 2,
  },
  trackerThSeries: {
    padding: '10px 8px',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: colors.textMuted,
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    minWidth: 44,
  },
  trackerSeriesLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: colors.textMuted,
  },
  trackerPlayerCell: {
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 600,
    color: colors.textPrimary,
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.surface,
    position: 'sticky',
    left: 0,
    zIndex: 1,
  },
  trackerCell: {
    padding: '8px 6px',
    textAlign: 'center',
    borderBottom: `1px solid ${colors.border}`,
    verticalAlign: 'middle',
  },
  trackerEmpty: {
    color: colors.textDim,
    fontSize: 12,
  },

  // Achievements
  achCard: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: '14px 16px',
  },
  achHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  achName: {
    fontSize: 15,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  achCount: {
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: '0.04em',
  },
  achBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  achBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: radius.md,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.03em',
  },
  achBadgePos: {
    background: `${colors.orange}15`,
    border: `1px solid ${colors.orange}44`,
    color: colors.textSecondary,
  },
  achBadgeNeg: {
    background: `${colors.gTier}15`,
    border: `1px solid ${colors.gTier}44`,
    color: colors.textSecondary,
  },
  achBadgeIcon: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  achBadgeLabel: {
    color: colors.textSecondary,
  },

  // Rivalries
  rivalCard: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: '14px 16px',
  },
  rivalPlayers: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rivalName: {
    fontSize: 14,
    fontWeight: 700,
    flex: 1,
  },
  rivalVs: {
    fontSize: 10,
    fontWeight: 800,
    color: colors.textMuted,
    letterSpacing: '0.1em',
    padding: '0 12px',
  },
  rivalBar: {
    height: 4,
    background: `${colors.border}`,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  rivalBarFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  rivalRecord: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 12,
  },
  rivalWins: {
    fontWeight: 700,
    color: colors.textSecondary,
    fontVariantNumeric: 'tabular-nums',
  },
  rivalGP: {
    fontSize: 11,
    color: colors.textMuted,
  },
  rivalDominant: {
    marginTop: 6,
    fontSize: 11,
    color: colors.orange,
    fontWeight: 600,
    letterSpacing: '0.03em',
  },

  selectInput: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    padding: '4px 10px',
    fontSize: 12,
    color: colors.textSecondary,
    cursor: 'pointer',
    fontFamily: fonts.display,
  },
}
