import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { computeImpactScores, tierLabel } from '../lib/ranking'
import { IconCrystal, IconLock, IconStar, IconChart, IconTrophy, IconEdit, IconShare, IconPlus, IconPublish, IconCheck } from '../lib/icons'
import { colors } from '../lib/theme'

// ─── Series Predictions Widget ────────────────────────────────────────────────
function PredictionsWidget({ seriesId, seriesStatus, players, ourTeam, oppTeam }) {
  const [predictions, setPredictions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ gamertag: '', winner: '', mvp_id: '', length: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadingPreds, setLoadingPreds] = useState(true)

  useEffect(() => {
    function loadPredictions() {
      supabase.from('series_predictions')
        .select('*, players(gamertag, display_name)')
        .eq('series_id', seriesId)
        .then(({ data }) => {
          setPredictions(data || [])
          setLoadingPreds(false)
        })
    }
    loadPredictions()
    const channel = supabase
      .channel(`predictions-${seriesId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'series_predictions', filter: `series_id=eq.${seriesId}` }, loadPredictions)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [seriesId])

  async function submitPrediction(e) {
    e.preventDefault()
    if (!form.gamertag.trim() || !form.winner) return
    setSaving(true)
    await supabase.from('series_predictions').upsert({
      series_id: seriesId,
      predictor_gamertag: form.gamertag.trim(),
      predicted_winner: form.winner,
      predicted_mvp_player_id: form.mvp_id || null,
      predicted_series_length: form.length ? parseInt(form.length) : null,
    }, { onConflict: 'series_id,predictor_gamertag' })
    setSaving(false)
    setSaved(v => !v)
    setShowForm(false)
    setForm({ gamertag: '', winner: '', mvp_id: '', length: '' })
  }

  if (loadingPreds) return null

  return (
    <div style={ps.wrap}>
      <div style={ps.header}>
        <div style={ps.title}>
          <IconCrystal size={15} color="#a78bfa" />
          PREDICTIONS
          <span style={ps.count}>{predictions.length}</span>
        </div>
        {seriesStatus === 'in_progress' && (
          <button onClick={() => setShowForm(v => !v)} style={ps.submitBtn}>
            {showForm ? 'Cancel' : 'Lock In Pick'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={submitPrediction} style={ps.form}>
          <input
            placeholder="Your gamertag"
            value={form.gamertag}
            onChange={e => setForm(f => ({ ...f, gamertag: e.target.value }))}
            style={ps.input}
            required
          />
          <div style={ps.row}>
            <select
              value={form.winner}
              onChange={e => setForm(f => ({ ...f, winner: e.target.value }))}
              style={ps.select}
              required
            >
              <option value="">Pick winner...</option>
              <option value="our">{ourTeam || 'Team 1'}</option>
              <option value="opp">{oppTeam || 'Team 2'}</option>
            </select>
            <select
              value={form.length}
              onChange={e => setForm(f => ({ ...f, length: e.target.value }))}
              style={ps.select}
            >
              <option value="">Series length...</option>
              {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>In {n}</option>)}
            </select>
          </div>
          <select
            value={form.mvp_id}
            onChange={e => setForm(f => ({ ...f, mvp_id: e.target.value }))}
            style={ps.select}
          >
            <option value="">Pick MVP (optional)...</option>
            {players.map(p => (
              <option key={p.player_id} value={p.player_id}>{p.gamertag}</option>
            ))}
          </select>
          <button type="submit" disabled={saving} style={ps.lockBtn}>
            {saving ? 'Locking in...' : <span style={{display:'flex',alignItems:'center',gap:5}}><IconLock size={13} color="#f4701b" /> Lock In Pick</span>}
          </button>
        </form>
      )}

      {predictions.length > 0 && (
        <div style={ps.list}>
          {predictions.map(p => {
            const mvpName = p.players?.gamertag
            const winnerLabel = p.predicted_winner === 'our' ? (ourTeam || 'Team 1') : (oppTeam || 'Team 2')
            return (
              <div key={p.id} style={ps.predRow}>
                <span style={ps.predWho}>{p.predictor_gamertag}</span>
                <span style={ps.predPick}>{winnerLabel}</span>
                {p.predicted_series_length && <span style={ps.predDetail}>in {p.predicted_series_length}</span>}
                {mvpName && <span style={ps.predMvp}>MVP: {mvpName}</span>}
              </div>
            )
          })}
        </div>
      )}

      {predictions.length === 0 && !showForm && (
        <p style={ps.empty}>No predictions yet. Be the first.</p>
      )}
    </div>
  )
}

const ps = {
  wrap: { background: '#050505', border: '1px solid #111', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '2rem' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' },
  title: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.1em', color: '#fff' },
  titleIcon: { fontSize: '0.9rem' },
  count: { background: '#111', borderRadius: 10, padding: '0.1rem 0.5rem', fontSize: '0.7rem', color: '#666', fontWeight: 600 },
  submitBtn: { background: 'transparent', border: '1px solid #f4701b', color: '#f4701b', borderRadius: 4, padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem', background: '#0a0500', border: '1px solid #1a1000', borderRadius: 8, padding: '0.75rem' },
  input: { background: '#000', border: '1px solid #222', borderRadius: 4, padding: '0.45rem 0.75rem', color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit' },
  row: { display: 'flex', gap: '0.5rem' },
  select: { flex: 1, background: '#000', border: '1px solid #222', borderRadius: 4, padding: '0.45rem 0.75rem', color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer' },
  lockBtn: { background: '#1a0d00', border: '1px solid #f4701b', color: '#f4701b', borderRadius: 4, padding: '0.5rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  predRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', background: '#0a0a0a', borderRadius: 5, flexWrap: 'wrap' },
  predWho: { fontWeight: 700, color: '#fff', fontSize: '0.82rem', minWidth: 80 },
  predPick: { background: '#1a0a2e', border: '1px solid #2a1a3e', borderRadius: 3, padding: '0.1rem 0.5rem', color: '#9333ea', fontSize: '0.75rem', fontWeight: 700 },
  predDetail: { color: '#555', fontSize: '0.72rem' },
  predMvp: { background: '#1a1000', border: '1px solid #4a3000', borderRadius: 3, padding: '0.1rem 0.5rem', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 600 },
  empty: { color: '#333', fontSize: '0.8rem', margin: 0 },
}

const TIER_ORDER = ['ELITE', 'STRONG', 'SOLID', 'G_TIER']
const TIER_COLORS = { ELITE: '#9333ea', STRONG: '#2563eb', SOLID: '#16a34a', G_TIER: '#dc2626' }

export default function SeriesDetail() {
  const { id } = useParams()
  const { isEditor, session } = useAuth()
  const navigate = useNavigate()
  const [series, setSeries] = useState(null)
  const [games, setGames] = useState([])
  const [stats, setStats] = useState([]) // series_player_stats view
  const [finalizedRankings, setFinalizedRankings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [copied, setCopied] = useState(false)

  const fetchAll = useCallback(async () => {
    const [{ data: ser }, { data: gms }, { data: sts }, { data: rankings }] = await Promise.all([
      supabase.from('series').select('*').eq('id', id).single(),
      supabase.from('games').select('*').eq('series_id', id).order('game_number'),
      supabase.from('series_player_stats').select('*').eq('series_id', id),
      supabase.from('series_rankings').select('*, players(gamertag,display_name)').eq('series_id', id).eq('finalized', true),
    ])
    setSeries(ser)
    setGames(gms || [])
    setStats(sts || [])
    setFinalizedRankings(rankings || [])
    setLastUpdated(new Date())
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchAll()
    // Subscribe to live game updates for this series
    const channel = supabase
      .channel(`series-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `series_id=eq.${id}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_stats' }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  async function markComplete() {
    const wins = games.filter(g => g.our_result === 'W').length
    const losses = games.filter(g => g.our_result === 'L').length
    const label = `${wins}–${losses} ${wins > losses ? 'W' : 'L'}`
    await supabase.from('series').update({
      status: 'complete',
      our_wins: wins,
      opp_wins: losses,
      result_label: label,
      ended_at: new Date().toISOString(),
      published: true,
    }).eq('id', id)
    fetchAll()
  }

  async function togglePublish() {
    await supabase.from('series').update({ published: !series.published }).eq('id', id)
    fetchAll()
  }

  if (loading) return <div style={s.page}><p style={s.dim}>Loading...</p></div>
  if (!series) return <div style={s.page}><p style={s.dim}>Series not found.</p></div>

  const wins = games.filter(g => g.our_result === 'W').length
  const losses = games.filter(g => g.our_result === 'L').length
  const maxWins = Math.ceil((series.format ?? 7) / 2)
  const seriesOver = wins >= maxWins || losses >= maxWins

  // Split stats by side
  const ourStats = stats.filter(p => p.primary_side === 'our').sort((a,b) => b.ppg - a.ppg)
  const oppStats = stats.filter(p => p.primary_side === 'opp').sort((a,b) => b.ppg - a.ppg)

  // Live rankings — use finalized if available, else compute deterministically
  const liveRankings = (() => {
    if (finalizedRankings.length > 0) return finalizedRankings.map(r => ({
      player_id: r.player_id,
      gamertag: r.players?.gamertag || '',
      display_name: r.players?.display_name,
      tier: r.tier,
      is_mvp: r.is_mvp,
      impact_score: r.impact_score,
      primary_side: r.primary_side,
      finalized: true,
    }))
    if (stats.length === 0) return []
    return computeImpactScores(stats).map(r => ({ ...r, finalized: false }))
  })()

  const isFinalized = liveRankings[0]?.finalized

  function handleShare() {
    const url = `${window.location.origin}/series/${id}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={s.page} className="sd-page">
      <style>{`
        @media (max-width: 899px) {
          .sd-back        { display: none !important; }
          .sd-page        { padding: 0 !important; }
          .sd-hero        { padding: 1.25rem 1rem 1rem !important; border-radius: 0 !important; margin-bottom: 0 !important; border-bottom: 1px solid #111 !important; }
          .sd-add-game    { margin: 0 !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; border-top: none !important; }
          .sd-ranking-wrap { border-radius: 0 !important; border-left: none !important; border-right: none !important; margin-bottom: 0 !important; }
          .sd-game-strip  { padding: 1rem !important; overflow-x: auto !important; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch !important; gap: 0.6rem !important; }
          .sd-game-card   { min-width: 88px !important; flex-shrink: 0 !important; }
          .sd-action-grid { grid-template-columns: 1fr 1fr !important; padding: 0.75rem 1rem !important; gap: 0.5rem !important; }
          .sd-matchup-cta { border-radius: 0 !important; border-left: none !important; border-right: none !important; }
          .sd-stats       { padding: 1rem !important; }
          .sd-predictions { padding: 0 1rem !important; }
        }
      `}</style>

      <Link to="/" style={s.back} className="sd-back">← All Series</Link>

      {/* ── HERO ── */}
      <div style={s.hero} className="sd-hero">
        <div style={s.heroTop}>
          <div style={{flex: 1, minWidth: 0}}>
            <span style={{
              ...s.statusBadge,
              background: series.status === 'complete' ? '#0f2a0f' : '#150826',
              color:      series.status === 'complete' ? '#4caf50'  : '#9333ea',
              border:     series.status === 'complete' ? '1px solid #1f4a1f' : '1px solid #2a1050',
            }}>
              {series.status === 'complete' ? series.result_label || 'FINAL' : 'LIVE'}
            </span>
            <h1 style={s.title}>{series.name}</h1>
            <div style={s.meta}>{series.our_team_name} vs {series.opp_team_name}</div>
            {series.storyline && <div style={s.storyline}>{series.storyline}</div>}
          </div>
          <div style={s.scoreBlock}>
            <span style={s.score}>{wins}–{losses}</span>
            <span style={s.scoreSub}>SERIES</span>
          </div>
        </div>
      </div>

      {/* ── ADD GAME — primary CTA when series is live ── */}
      {series.status !== 'complete' && (
        <div style={s.addGameWrap} className="sd-add-game">
          <button onClick={() => navigate(`/series/${id}/add-game`)} style={s.addGameBtn}>
            <IconPlus size={16} color="#fff" />
            <span>Add Game</span>
          </button>
          {isEditor && seriesOver && (
            <button onClick={markComplete} style={s.completeBtn}>
              <IconCheck size={16} color="#4caf50" />
              <span>Mark Complete</span>
            </button>
          )}
        </div>
      )}

      {/* ── RANKINGS ── */}
      {liveRankings.length > 0 && (
        <div style={s.rankingWrap} className="sd-ranking-wrap">
          <div style={s.rankingHeader}>
            <div style={s.rankingTitle}>
              {isFinalized
                ? <span style={s.finalBadge}>FINAL RANKINGS</span>
                : <span style={s.liveBadge}>LIVE RANKINGS</span>
              }
            </div>
            <div style={s.rankingMeta}>
              {isFinalized
                ? <Link to={`/series/${id}/chart`} style={s.rankingChartLink}>View Chart →</Link>
                : <button onClick={fetchAll} style={s.refreshBtn}>↻ Refresh</button>
              }
            </div>
          </div>
          {TIER_ORDER.map(tier => {
            const players = liveRankings.filter(r => r.tier === tier)
            if (players.length === 0) return null
            return (
              <div key={tier} style={{...s.tierRow, borderLeftColor: TIER_COLORS[tier]}}>
                <div style={{...s.tierTag, color: TIER_COLORS[tier]}}>{tierLabel(tier)}</div>
                <div style={s.tierPlayers}>
                  {players.map(r => (
                    <Link key={r.player_id} to={`/player/${r.gamertag}`} style={{...s.rankPlayer, textDecoration: 'none'}}>
                      {r.is_mvp && <IconStar size={12} color={colors.gold} filled />}
                      <span style={{color: '#fff', fontWeight: 700}}>{r.display_name || r.gamertag}</span>
                      <span style={s.impactScore}>{Number(r.impact_score || 0).toFixed(1)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
          {!isFinalized && isEditor && (
            <div style={s.rankingFooter}>
              <Link to={`/series/${id}/rankings`} style={{color: '#f4701b', textDecoration: 'none'}}>Open editor to adjust & publish →</Link>
            </div>
          )}
        </div>
      )}

      {/* ── GAME STRIP ── */}
      {games.length > 0 && (
        <div style={s.gameStrip} className="sd-game-strip">
          {games.map(g => {
            const isW = g.our_result === 'W'
            const isL = g.our_result === 'L'
            const accentColor = isW ? '#16a34a' : isL ? '#dc2626' : '#333'
            return (
              <div key={g.id} style={{...s.gameCard, borderLeftColor: accentColor}} className="sd-game-card">
                <div style={s.gameLabel}>GAME {g.game_number}</div>
                <div style={s.gameScore}>{g.our_score}–{g.opp_score}</div>
                <div style={{...s.gameResult, color: accentColor}}>
                  {isW ? 'W' : isL ? 'L' : '—'} +{Math.abs(g.our_score - g.opp_score)}
                </div>
                <Link to={`/series/${id}/game/${g.id}/matchup`} style={s.matchupLink}>matchup</Link>
                {isEditor && <Link to={`/series/${id}/game/${g.id}/edit`} style={s.editLink}>edit</Link>}
              </div>
            )
          })}
        </div>
      )}
      {games.length === 0 && series.status !== 'complete' && (
        <div style={s.emptyGames}>No games yet — tap Add Game above to get started.</div>
      )}

      {/* ── MATCHUP CTA ── */}
      {games.length > 0 && (
        <div style={s.matchupCta} className="sd-matchup-cta">
          <div style={s.matchupCtaLeft}>
            <span style={{color: '#f4701b', fontWeight: 800, fontSize: '0.82rem'}}>Log matchups</span>
            <span style={{color: '#444', fontSize: '0.75rem', marginLeft: 5}}>— updates your defensive score</span>
          </div>
          <div style={s.matchupCtaGames}>
            {games.map(g => (
              <Link key={g.id} to={`/series/${id}/game/${g.id}/matchup`} style={s.matchupCtaBtn}>G{g.game_number}</Link>
            ))}
          </div>
        </div>
      )}

      {/* ── ACTION GRID ── */}
      <div style={s.actionGrid} className="sd-action-grid">
        <Link to={`/series/${id}/chart`} style={s.actionBtn}>
          <IconChart size={18} color="#888" />
          <span style={s.actionLabel}>Chart</span>
        </Link>
        <Link to={`/series/${id}/accolades`} style={s.actionBtn}>
          <IconTrophy size={18} color="#888" />
          <span style={s.actionLabel}>Accolades</span>
        </Link>
        {isEditor && (
          <Link to={`/series/${id}/rankings`} style={s.actionBtn}>
            <IconEdit size={18} color="#888" />
            <span style={s.actionLabel}>Rankings</span>
          </Link>
        )}
        {isEditor && series.status === 'complete' && (
          <button onClick={togglePublish} style={s.actionBtn}>
            <IconPublish size={18} color="#888" />
            <span style={s.actionLabel}>{series.published ? 'Unpublish' : 'Publish'}</span>
          </button>
        )}
        <button onClick={handleShare} style={{...s.actionBtn, ...(copied ? s.actionBtnCopied : {})}}>
          <IconShare size={18} color={copied ? '#4caf50' : '#888'} />
          <span style={{...s.actionLabel, color: copied ? '#4caf50' : '#555'}}>{copied ? 'Copied!' : 'Share'}</span>
        </button>
      </div>

      {/* ── PREDICTIONS ── */}
      <div style={{padding: '0 2rem'}} className="sd-predictions">
        <PredictionsWidget
          seriesId={id}
          seriesStatus={series.status}
          players={stats}
          ourTeam={series.our_team_name}
          oppTeam={series.opp_team_name}
        />
      </div>

      {/* ── STATS ── */}
      {stats.length > 0 && (
        <div style={s.tableWrap} className="sd-stats">
          <StatsTable players={ourStats} teamName={series.our_team_name || 'Team A'} />
          {oppStats.length > 0 && <StatsTable players={oppStats} teamName={series.opp_team_name || 'Team B'} />}
        </div>
      )}
    </div>
  )
}

function StatCell({ value, type }) {
  let color = '#ccc'
  if (type === 'fg' || type === '3p') {
    if (value === null || value === undefined) return <td style={s.td}>—</td>
    if (value >= 60) color = '#4caf50'
    else if (value >= 50) color = '#ffc107'
    else color = '#e53935'
    return <td style={{...s.td, color, fontWeight: 600}}>{value}%</td>
  }
  if (type === 'tov') {
    if (value <= 0.8) color = '#4caf50'
    else if (value <= 1.9) color = '#ffc107'
    else color = '#e53935'
    return <td style={{...s.td, color, fontWeight: value >= 2 ? 700 : 400}}>{value}</td>
  }
  return <td style={s.td}>{value ?? '—'}</td>
}

function StatsTable({ players, teamName }) {
  return (
    <div style={{marginBottom: '2rem'}}>
      <div style={{...s.teamLabel, color: '#aaa'}}>{teamName}</div>
      <div style={{overflowX: 'auto'}}>
        <table style={s.table}>
          <thead>
            <tr>
              {['PLAYER','GP','PPG','RPG','APG','SPG','BPG','TO/G','FG%','3P%','BEST'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p.player_id} style={s.tr}>
                <td style={{...s.td, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap'}}>
                  <Link to={`/player/${p.gamertag}`} style={{color: '#fff', textDecoration: 'none'}}>
                    {p.display_name || p.gamertag}
                  </Link>
                  {p.display_name && p.display_name !== p.gamertag && (
                    <span style={{color:'#555', fontWeight:400, marginLeft:6, fontSize:'0.8rem'}}>{p.gamertag}</span>
                  )}
                </td>
                <td style={s.td}>{p.gp}</td>
                <td style={s.td}>{p.ppg}</td>
                <td style={s.td}>{p.rpg}</td>
                <td style={s.td}>{p.apg}</td>
                <td style={s.td}>{p.spg}</td>
                <td style={s.td}>{p.bpg}</td>
                <StatCell value={p.tovpg} type="tov" />
                <StatCell value={p.fg_pct} type="fg" />
                <StatCell value={p.three_pct} type="3p" />
                <td style={s.td}>{p.best_pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', padding: '2rem', maxWidth: 1100, margin: '0 auto' },
  back: { color: '#444', textDecoration: 'none', fontSize: '0.8rem', display: 'block', marginBottom: '1.5rem', letterSpacing: '0.02em' },

  // Hero
  hero: { background: '#060606', padding: '1.75rem 2rem 1.5rem', marginBottom: 0 },
  heroTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' },
  statusBadge: { display: 'inline-block', fontSize: '0.62rem', padding: '0.2rem 0.55rem', borderRadius: 3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem' },
  title: { margin: '0 0 0.3rem', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15 },
  meta: { color: '#444', fontSize: '0.8rem', marginBottom: '0.3rem' },
  storyline: { color: '#666', fontSize: '0.85rem', fontStyle: 'italic', marginTop: '0.4rem' },
  scoreBlock: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0, flexShrink: 0 },
  score: { fontSize: '3rem', fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' },
  scoreSub: { color: '#333', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textAlign: 'right' },

  // Add Game CTA strip
  addGameWrap: { display: 'flex', gap: '0.6rem', padding: '0.85rem 2rem', background: '#060606', borderTop: '1px solid #111', borderBottom: '1px solid #111', marginBottom: 0 },
  addGameBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: '#f4701b', color: '#fff', border: 'none', borderRadius: 8, padding: '0.7rem 1rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' },
  completeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: '#0a1a0a', color: '#4caf50', border: '1px solid #1a4a1a', borderRadius: 8, padding: '0.7rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },

  // Rankings
  rankingWrap: { background: '#060606', borderTop: '1px solid #111', borderBottom: '1px solid #111', padding: '1.1rem 2rem 1.25rem', marginBottom: 0 },
  rankingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem' },
  rankingTitle: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  rankingMeta: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  rankingChartLink: { color: '#f4701b', textDecoration: 'none', fontWeight: 700, fontSize: '0.8rem' },
  liveBadge: { background: '#0a1a0a', border: '1px solid #1a4a1a', color: '#4caf50', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', padding: '0.18rem 0.55rem', borderRadius: 3 },
  finalBadge: { background: '#1a1000', border: '1px solid #3a2200', color: '#f4701b', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', padding: '0.18rem 0.55rem', borderRadius: 3 },
  refreshBtn: { background: 'transparent', border: 'none', color: '#9333ea', fontSize: '0.75rem', cursor: 'pointer', padding: '0.2rem 0.4rem', borderRadius: 4 },
  tierRow: { display: 'flex', alignItems: 'flex-start', gap: '0.85rem', borderLeft: '2px solid', paddingLeft: '0.85rem', marginBottom: '0.7rem' },
  tierTag: { fontWeight: 800, fontSize: '0.6rem', letterSpacing: '0.13em', textTransform: 'uppercase', minWidth: 76, paddingTop: '0.3rem', flexShrink: 0 },
  tierPlayers: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem' },
  rankPlayer: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#0c0c0c', border: '1px solid #161616', borderRadius: 6, padding: '0.3rem 0.65rem', fontSize: '0.82rem', cursor: 'pointer' },
  impactScore: { color: '#2e2e2e', fontSize: '0.68rem', marginLeft: 1 },
  rankingFooter: { marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid #0f0f0f', color: '#444', fontSize: '0.76rem' },

  // Game strip
  gameStrip: { display: 'flex', gap: '0.65rem', padding: '1rem 2rem', borderBottom: '1px solid #111', overflowX: 'auto', flexWrap: 'wrap' },
  gameCard: { background: '#080808', border: '1px solid #161616', borderLeft: '2px solid', borderRadius: 8, padding: '0.7rem 0.9rem', minWidth: 108, flexShrink: 0 },
  gameLabel: { fontSize: '0.62rem', color: '#444', marginBottom: '0.3rem', fontWeight: 700, letterSpacing: '0.12em' },
  gameScore: { fontSize: '1.05rem', fontWeight: 800, color: '#fff', marginBottom: '0.2rem', letterSpacing: '-0.01em' },
  gameResult: { fontSize: '0.7rem', fontWeight: 700, marginBottom: '0.1rem' },
  editLink: { display: 'block', fontSize: '0.65rem', color: '#333', textDecoration: 'none', marginTop: '0.35rem' },
  matchupLink: { display: 'block', fontSize: '0.65rem', color: '#f4701b', textDecoration: 'none', marginTop: '0.4rem', fontWeight: 600 },
  emptyGames: { color: '#333', fontSize: '0.82rem', padding: '1.5rem 2rem', textAlign: 'center' },

  // Matchup CTA
  matchupCta: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', background: '#08060a', borderBottom: '1px solid #111', padding: '0.7rem 2rem' },
  matchupCtaLeft: { fontSize: '0.82rem' },
  matchupCtaGames: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap' },
  matchupCtaBtn: { background: '#12090e', border: '1px solid #2a1020', borderRadius: 6, padding: '0.3rem 0.65rem', fontSize: '0.72rem', color: '#f4701b', fontWeight: 800, textDecoration: 'none', letterSpacing: '0.04em' },

  // Action grid — icon+label buttons
  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', padding: '0.85rem 2rem', borderBottom: '1px solid #111' },
  actionBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', background: '#0a0a0a', border: '1px solid #161616', borderRadius: 10, padding: '0.75rem 0.5rem', cursor: 'pointer', textDecoration: 'none', transition: 'border-color 0.15s' },
  actionLabel: { fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555' },
  actionBtnCopied: { borderColor: '#1a4a1a', background: '#060f06' },

  // Stats
  tableWrap: { padding: '0 2rem 2rem' },
  teamLabel: { fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem', color: '#555' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { color: '#444', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.45rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #111', whiteSpace: 'nowrap' },
  td: { color: '#ccc', padding: '0.5rem 0.75rem', borderBottom: '1px solid #0a0a0a' },
  tr: {},
  dim: { color: '#444' },
}
