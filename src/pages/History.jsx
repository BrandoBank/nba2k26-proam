import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { colors, fonts, radius, statColor } from '../lib/theme'
import { IconTrophy, IconChart, IconArrow, IconStar, IconBall } from '../lib/icons'

// ─── Tier helpers ────────────────────────────────────────────────────────────

const TIER_ORDER = ['ELITE', 'STRONG', 'SOLID', 'G_TIER']

const TIER_META = {
  ELITE:  { label: 'E',  short: 'ELITE',  color: colors.elite,  bg: colors.eliteBg },
  STRONG: { label: 'S',  short: 'STR',    color: colors.strong, bg: colors.strongBg },
  SOLID:  { label: 'SO', short: 'SOLID',  color: colors.solid,  bg: colors.solidBg },
  G_TIER: { label: 'G',  short: 'G',      color: colors.gTier,  bg: colors.gTierBg },
}

function TierBadge({ tier, size = 'sm' }) {
  const meta = TIER_META[tier]
  if (!meta) return null
  const isLarge = size === 'lg'
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: isLarge ? 11 : 9,
      fontWeight: 800,
      letterSpacing: '0.04em',
      color: meta.color,
      background: meta.bg,
      border: `1px solid ${meta.color}33`,
      borderRadius: radius.sm,
      padding: isLarge ? '3px 8px' : '2px 5px',
      minWidth: isLarge ? 40 : 22,
      fontFamily: fonts.display,
    }}>
      {isLarge ? meta.short : meta.label}
    </span>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'leaders',  label: 'ALL-TIME LEADERS' },
  { id: 'log',      label: 'SERIES LOG' },
  { id: 'tracker',  label: 'TIER TRACKER' },
]

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
        ] = await Promise.all([
          supabase.from('career_player_totals').select('*'),
          supabase.from('series').select('*').eq('status', 'complete').order('ended_at', { ascending: false }),
          supabase.from('series_rankings').select('*'),
        ])
        if (e1 || e2 || e3) throw new Error('Failed to load history data.')
        setCareerStats(career || [])
        setSeriesList(series || [])
        setRankings(rnk || [])
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

  // ── Tier tracker data ───────────────────────────────────────────────────────
  const { trackerPlayers, trackerSeries, trackerMap } = useMemo(() => {
    // Sort series by ended_at ascending (chronological left-to-right)
    const trackerSeries = [...seriesList].sort((a, b) =>
      (a.ended_at || '').localeCompare(b.ended_at || '')
    )
    // Collect unique players from rankings
    const playerMap = {}
    for (const r of rankings) {
      if (!playerMap[r.player_id]) {
        playerMap[r.player_id] = { player_id: r.player_id, gamertag: r.gamertag, display_name: r.display_name || r.gamertag }
      }
    }
    const trackerPlayers = Object.values(playerMap).sort((a, b) =>
      (a.display_name || '').localeCompare(b.display_name || '')
    )
    // Build map: player_id -> series_id -> tier
    const trackerMap = {}
    for (const r of rankings) {
      if (!trackerMap[r.player_id]) trackerMap[r.player_id] = {}
      trackerMap[r.player_id][r.series_id] = r.tier
    }
    return { trackerPlayers, trackerSeries, trackerMap }
  }, [seriesList, rankings])

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

  return (
    <div style={s.tabContent}>
      {series.length === 0 && (
        <div style={s.empty}>
          <p style={s.dim}>No completed series yet.</p>
        </div>
      )}
      <div style={s.logList}>
        {series.map(ser => {
          const isWin = (ser.our_wins || 0) > (ser.opp_wins || 0)
          const isTie = (ser.our_wins || 0) === (ser.opp_wins || 0)
          const resultColor = isWin ? colors.statGreen : isTie ? colors.statGold : colors.statRed
          const resultLabel = ser.result_label || `${ser.our_wins || 0}–${ser.opp_wins || 0}`
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
                    <span style={{ color: colors.teamOur }}>{ser.our_team_name || 'Us'}</span>
                    <span style={s.logVs}>vs</span>
                    <span style={{ color: colors.teamOpp }}>{ser.opp_team_name || 'Them'}</span>
                  </div>
                  {mvp && (
                    <div style={s.logMvp}>
                      <IconTrophy size={12} color={colors.gold} />
                      <span style={{ color: colors.gold }}>MVP: {mvp}</span>
                    </div>
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
        Each cell shows tier per series. Columns = series (oldest to newest).
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
                  const tier = map[p.player_id]?.[ser.id]
                  return (
                    <td key={ser.id} style={s.trackerCell}>
                      {tier ? <TierBadge tier={tier} size="sm" /> : <span style={s.trackerEmpty}>–</span>}
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
}
