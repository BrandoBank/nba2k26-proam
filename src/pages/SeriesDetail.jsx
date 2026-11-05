import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { computeImpactScores, computeDefensiveDeltas, tierLabel } from '../lib/ranking'
import { IconCrystal, IconLock, IconStar, IconChart, IconTrophy, IconEdit, IconShare, IconPlus, IconPublish, IconCheck, IconChat } from '../lib/icons'
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
  const { isEditor, session, gamertag: authGamertag } = useAuth()
  const navigate = useNavigate()
  const [series, setSeries] = useState(null)
  const [games, setGames] = useState([])
  const [stats, setStats] = useState([]) // series_player_stats view
  const [finalizedRankings, setFinalizedRankings] = useState([])
  const [matchups, setMatchups] = useState([])
  const [perGameStats, setPerGameStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [copied, setCopied] = useState(false)

  const fetchAll = useCallback(async () => {
    const [{ data: ser }, { data: gms }, { data: sts }, { data: rankings }, { data: mups }, { data: pgs }] = await Promise.all([
      supabase.from('series').select('*').eq('id', id).single(),
      supabase.from('games').select('*').eq('series_id', id).order('game_number'),
      supabase.from('series_player_stats').select('*').eq('series_id', id),
      supabase.from('series_rankings').select('*, players(gamertag,display_name)').eq('series_id', id).eq('finalized', true),
      supabase.rpc('get_series_matchups', { p_series_id: id }),
      supabase.rpc('get_series_game_pts', { p_series_id: id }),
    ])
    setSeries(ser)
    setGames(gms || [])
    setStats(sts || [])
    setFinalizedRankings(rankings || [])
    setMatchups(mups || [])
    setPerGameStats(pgs || [])
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_matchups', filter: `series_id=eq.${id}` }, fetchAll)
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

  // Live rankings: for an active (in_progress) series always recompute from
  // current stats + matchup defensive deltas so new matchup saves update the
  // display immediately. Finalized rankings are used for completed/unfinished.
  const liveRankings = (() => {
    const isSeriesLive = series.status === 'in_progress'
    if (!isSeriesLive && finalizedRankings.length > 0) return finalizedRankings.map(r => ({
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
    const defDeltas = computeDefensiveDeltas(matchups, perGameStats, stats)
    return computeImpactScores(stats, defDeltas).map(r => ({ ...r, finalized: false }))
  })()

  const isFinalized = liveRankings[0]?.finalized

  function handleShare() {
    const url = `${window.location.origin}/series/${id}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isLive = series.status === 'in_progress'
  const isUnfinished = series.status === 'unfinished'
  const isActive = isLive || isUnfinished  // can still add games
  const heroGradient = isLive
    ? 'linear-gradient(135deg, #0c0010 0%, #08000f 40%, #000 100%)'
    : isUnfinished
      ? 'linear-gradient(135deg, #0a0800 0%, #080500 40%, #000 100%)'
      : 'linear-gradient(135deg, #030d03 0%, #050505 40%, #000 100%)'
  const accentGlow = isLive ? '#9333ea' : isUnfinished ? '#ca8a04' : '#16a34a'

  return (
    <div style={s.page} className="sd-page">
      <style>{`
        @media (max-width: 899px) {
          .sd-back     { display: none !important; }
          .sd-page     { padding: 0 !important; }
          .sd-hero     { padding: 1.5rem 1.1rem 1.25rem !important; border-radius: 0 !important; }
          .sd-add      { padding: 0.8rem 1.1rem !important; border-radius: 0 !important; }
          .sd-ranks    { padding: 1rem 1.1rem !important; border-radius: 0 !important; }
          .sd-games    { padding: 0.85rem 1.1rem !important; overflow-x: auto; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; }
          .sd-games > * { flex-shrink: 0 !important; }
          .sd-actions  { grid-template-columns: 1fr 1fr !important; padding: 0.85rem 1.1rem !important; }
          .sd-cta      { padding: 0.6rem 1.1rem !important; border-radius: 0 !important; }
          .sd-preds    { padding: 0 1.1rem !important; }
          .sd-stats    { padding: 0 1.1rem 3rem !important; }
        }
      `}</style>

      <Link to="/" style={s.back} className="sd-back">← All Series</Link>

      {/* ══ HERO ══ */}
      <div style={{...s.hero, background: heroGradient}} className="sd-hero">
        {/* Glow accent line */}
        <div style={{...s.heroGlowBar, background: accentGlow}} />
        <div style={s.heroInner}>
          <div style={s.heroLeft}>
            <div style={s.heroMeta}>{series.our_team_name} vs {series.opp_team_name}</div>
            <h1 style={s.heroTitle}>{series.name}</h1>
            {series.storyline && <div style={s.heroStory}>{series.storyline}</div>}
          </div>
          <div style={s.heroRight}>
            <div style={s.heroScore}>{wins}–{losses}</div>
            <div style={{...s.heroBadge, color: accentGlow, borderColor: accentGlow + '44', background: accentGlow + '14'}}>
              {isLive ? 'LIVE' : isUnfinished ? 'UNFINISHED' : series.result_label || 'FINAL'}
            </div>
          </div>
        </div>
      </div>

      {/* ══ ADD GAME — top CTA ══ */}
      {isActive && isEditor && (
        <div style={s.addWrap} className="sd-add">
          <button onClick={() => navigate(`/series/${id}/add-game`)} style={s.addBtn}>
            <IconPlus size={15} color="#fff" />
            Add Game
          </button>
          {seriesOver && (
            <button onClick={markComplete} style={s.completeBtn}>
              <IconCheck size={15} color="#4caf50" />
              Mark Complete
            </button>
          )}
        </div>
      )}

      {/* ══ RANKINGS ══ */}
      {liveRankings.length > 0 && (
        <div style={s.ranksWrap} className="sd-ranks">
          <div style={s.ranksHead}>
            <span style={s.ranksSectionLabel}>
              {isFinalized ? 'FINAL RANKINGS' : 'LIVE RANKINGS'}
            </span>
            <div style={s.ranksHeadRight}>
              {isFinalized
                ? <Link to={`/series/${id}/chart`} style={s.ranksChartLink}>View Chart →</Link>
                : <button onClick={fetchAll} style={s.refreshBtn}>↻</button>
              }
              {!isFinalized && isEditor && (
                <Link to={`/series/${id}/rankings`} style={s.ranksEditLink}>Edit</Link>
              )}
            </div>
          </div>

          {TIER_ORDER.map(tier => {
            const players = liveRankings.filter(r => r.tier === tier)
            if (players.length === 0) return null
            const tc = TIER_COLORS[tier]
            return (
              <div key={tier} style={s.tierSection}>
                {/* Tier header */}
                <div style={{...s.tierHeader, borderLeftColor: tc}}>
                  <span style={{...s.tierLabel, color: tc}}>{tierLabel(tier)}</span>
                </div>
                {/* Player rows */}
                {players.map((r, i) => (
                  <Link key={r.player_id} to={`/player/${r.gamertag}`} style={{...s.playerRow, textDecoration: 'none', background: i % 2 === 0 ? 'transparent' : '#050505'}}>
                    <div style={s.playerRowLeft}>
                      <span style={{...s.playerRank, color: tc}}>{i + 1}</span>
                      <div style={s.playerInfo}>
                        <span style={s.playerName}>{r.display_name || r.gamertag}</span>
                        {r.display_name && r.display_name !== r.gamertag && (
                          <span style={s.playerTag}>{r.gamertag}</span>
                        )}
                      </div>
                    </div>
                    <div style={s.playerRowRight}>
                      {r.is_mvp && <IconStar size={11} color={colors.gold} filled />}
                      <span style={s.playerScore}>{Number(r.impact_score || 0).toFixed(1)}</span>
                      <button
                        onClick={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          const score = Number(r.impact_score || 0).toFixed(1)
                          const quote = `${r.gamertag} — ${score} impact, ${tierLabel(tier)} tier · ${series.name}`
                          navigate(`/feed?quote=${encodeURIComponent(quote)}`)
                        }}
                        style={s.chatBtn}
                      >
                        <IconChat size={11} color="#555" />
                      </button>
                    </div>
                  </Link>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* ══ GAME RESULTS ══ */}
      {games.length > 0 && (
        <div style={s.gamesSection}>
          <div style={s.gamesSectionLabel}>RESULTS</div>
          <div style={s.gamesStrip} className="sd-games">
            {games.map(g => {
              const isW = g.our_result === 'W'
              const isL = g.our_result === 'L'
              const color = isW ? '#16a34a' : isL ? '#dc2626' : '#333'
              // Check if the signed-in user already has a matchup logged for this game
              const myRankRow = authGamertag && liveRankings.find(r => r.gamertag?.toLowerCase() === authGamertag.toLowerCase())
              const myMatchup = myRankRow && matchups.find(m => m.game_id === g.id && m.defender_player_id === myRankRow.player_id)
              return (
                <div key={g.id} style={{...s.gameCard, borderColor: color + '60', background: isW ? '#020a02' : isL ? '#0a0202' : '#060606'}}>
                  <div style={{...s.gameCardResult, color}}>{isW ? 'W' : isL ? 'L' : '?'}</div>
                  <div style={s.gameCardScore}>{g.our_score}–{g.opp_score}</div>
                  <div style={{...s.gameCardMargin, color: color + 'cc'}}>+{Math.abs(g.our_score - g.opp_score)}</div>
                  <div style={s.gameCardNum}>G{g.game_number}</div>
                  <Link to={`/series/${id}/game/${g.id}/matchup`} style={myMatchup ? {...s.gameCardLink, color: '#4caf50'} : s.gameCardLink}>
                    {myMatchup ? '✓ matchup' : 'matchup'}
                  </Link>
                  {isEditor && <Link to={`/series/${id}/game/${g.id}/edit`} style={s.gameCardEdit}>edit</Link>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {games.length === 0 && isActive && (
        <div style={s.emptyGames}>No games logged yet.</div>
      )}

      {/* ══ MATCHUP CTA ══ */}
      {games.length > 0 && (
        <div style={s.ctaWrap} className="sd-cta">
          <span style={s.ctaText}>Log your matchup</span>
          <span style={s.ctaSubtext}>— affects your defensive impact score</span>
          <div style={s.ctaGames}>
            {games.map(g => (
              <Link key={g.id} to={`/series/${id}/game/${g.id}/matchup`} style={s.ctaGameBtn}>Game {g.game_number}</Link>
            ))}
          </div>
        </div>
      )}

      {/* ══ ACTIONS ══ */}
      <div style={s.actionsGrid} className="sd-actions">
        <Link to={`/series/${id}/chart`} style={s.actionTile}>
          <IconChart size={20} color="#555" />
          <span style={s.actionTileLabel}>Chart</span>
        </Link>
        <Link to={`/series/${id}/accolades`} style={s.actionTile}>
          <IconTrophy size={20} color="#555" />
          <span style={s.actionTileLabel}>Accolades</span>
        </Link>
        {isEditor && (
          <Link to={`/series/${id}/rankings`} style={s.actionTile}>
            <IconEdit size={20} color="#555" />
            <span style={s.actionTileLabel}>Rankings</span>
          </Link>
        )}
        {isEditor && !isLive && (
          <button onClick={togglePublish} style={s.actionTile}>
            <IconPublish size={20} color="#555" />
            <span style={s.actionTileLabel}>{series.published ? 'Unpublish' : 'Publish'}</span>
          </button>
        )}
        <button onClick={handleShare} style={{...s.actionTile, ...(copied ? {borderColor: '#1a4a1a', background: '#020f02'} : {})}}>
          <IconShare size={20} color={copied ? '#4caf50' : '#555'} />
          <span style={{...s.actionTileLabel, color: copied ? '#4caf50' : '#444'}}>{copied ? 'Copied!' : 'Share'}</span>
        </button>
      </div>

      {/* ══ PREDICTIONS ══ */}
      <div style={{padding: '0 2rem'}} className="sd-preds">
        <PredictionsWidget
          seriesId={id}
          seriesStatus={series.status}
          players={stats}
          ourTeam={series.our_team_name}
          oppTeam={series.opp_team_name}
        />
      </div>

      {/* ══ STATS ══ */}
      {stats.length > 0 && (
        <div style={{padding: '0 2rem 3rem'}} className="sd-stats">
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
      <div style={s.teamLabel}>{teamName}</div>
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
  page: { minHeight: '100vh', background: '#000', color: '#fff', padding: '2rem', maxWidth: 900, margin: '0 auto' },
  back: { color: '#444', textDecoration: 'none', fontSize: '0.8rem', display: 'block', marginBottom: '1.5rem' },

  // Hero
  hero: { padding: '2rem', position: 'relative', overflow: 'hidden' },
  heroGlowBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.8 },
  heroInner: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.5rem' },
  heroLeft: { flex: 1, minWidth: 0 },
  heroMeta: { fontSize: '0.72rem', color: '#555', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' },
  heroTitle: { margin: '0 0 0.4rem', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 },
  heroStory: { color: '#555', fontSize: '0.82rem', fontStyle: 'italic', marginTop: '0.35rem' },
  heroRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', flexShrink: 0 },
  heroScore: { fontSize: '3.25rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: '#fff' },
  heroBadge: { fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', padding: '0.22rem 0.6rem', borderRadius: 3, border: '1px solid', textTransform: 'uppercase' },

  // Add game
  addWrap: { display: 'flex', gap: '0.6rem', padding: '0.75rem 2rem', borderTop: '1px solid #111', borderBottom: '1px solid #0d0d0d' },
  addBtn: { flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', background: '#f4701b', color: '#fff', border: 'none', borderRadius: 9, padding: '0.7rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.01em' },
  completeBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', background: '#071207', color: '#4caf50', border: '1px solid #1a4a1a', borderRadius: 9, padding: '0.7rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },

  // Rankings
  ranksWrap: { padding: '1.25rem 2rem', borderBottom: '1px solid #0d0d0d' },
  ranksHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem' },
  ranksSectionLabel: { fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', color: '#444', textTransform: 'uppercase' },
  ranksHeadRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  ranksChartLink: { fontSize: '0.75rem', fontWeight: 700, color: '#f4701b', textDecoration: 'none' },
  ranksEditLink: { fontSize: '0.72rem', fontWeight: 600, color: '#555', textDecoration: 'none', border: '1px solid #222', borderRadius: 5, padding: '0.18rem 0.5rem' },
  refreshBtn: { background: 'transparent', border: '1px solid #1e1e1e', color: '#555', fontSize: '0.78rem', cursor: 'pointer', padding: '0.18rem 0.5rem', borderRadius: 5 },

  tierSection: { marginBottom: '0.9rem' },
  tierHeader: { borderLeft: '2px solid', paddingLeft: '0.7rem', marginBottom: '0.3rem' },
  tierLabel: { fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' },

  playerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.7rem', borderRadius: 7, cursor: 'pointer' },
  playerRowLeft: { display: 'flex', alignItems: 'center', gap: '0.7rem' },
  playerRank: { fontSize: '0.72rem', fontWeight: 800, minWidth: 16, textAlign: 'right', flexShrink: 0 },
  playerInfo: { display: 'flex', alignItems: 'baseline', gap: '0.4rem' },
  playerName: { fontSize: '0.9rem', fontWeight: 700, color: '#fff' },
  playerTag: { fontSize: '0.72rem', color: '#444' },
  playerRowRight: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  playerScore: { fontSize: '0.78rem', fontWeight: 700, color: '#2a2a2a' },
  chatBtn: { background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.15rem 0.3rem', display: 'flex', alignItems: 'center', borderRadius: 4, opacity: 0.6 },

  // Game strip
  gamesSection: { padding: '1rem 2rem', borderBottom: '1px solid #0d0d0d' },
  gamesSectionLabel: { fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.14em', color: '#333', marginBottom: '0.7rem' },
  gamesStrip: { display: 'flex', gap: '0.6rem', flexWrap: 'wrap' },
  gameCard: { border: '1px solid', borderRadius: 10, padding: '0.8rem 1rem', minWidth: 100, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  gameCardResult: { fontSize: '1.1rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em' },
  gameCardScore: { fontSize: '0.85rem', fontWeight: 800, color: '#fff', marginTop: '0.2rem' },
  gameCardMargin: { fontSize: '0.7rem', fontWeight: 700 },
  gameCardNum: { fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: '#333', marginTop: '0.3rem' },
  gameCardLink: { display: 'block', fontSize: '0.65rem', color: '#f4701b', textDecoration: 'none', marginTop: '0.4rem', fontWeight: 600 },
  gameCardEdit: { display: 'block', fontSize: '0.62rem', color: '#2a2a2a', textDecoration: 'none', marginTop: '0.15rem' },
  emptyGames: { color: '#2a2a2a', fontSize: '0.82rem', padding: '1rem 2rem' },

  // Matchup CTA
  ctaWrap: { padding: '0.65rem 2rem', borderBottom: '1px solid #0d0d0d', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', background: '#030005' },
  ctaText: { fontSize: '0.78rem', fontWeight: 800, color: '#f4701b' },
  ctaSubtext: { fontSize: '0.72rem', color: '#333' },
  ctaGames: { display: 'flex', gap: '0.3rem', flexWrap: 'wrap' },
  ctaGameBtn: { background: '#0d0012', border: '1px solid #2a0050', borderRadius: 6, padding: '0.25rem 0.6rem', fontSize: '0.7rem', color: '#9333ea', fontWeight: 800, textDecoration: 'none' },

  // Actions
  actionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem', padding: '1rem 2rem', borderBottom: '1px solid #0d0d0d' },
  actionTile: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', background: '#080808', border: '1px solid #141414', borderRadius: 12, padding: '0.9rem 0.5rem', cursor: 'pointer', textDecoration: 'none' },
  actionTileLabel: { fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#444' },

  // Stats
  teamLabel: { fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem', color: '#444', paddingTop: '1.5rem', paddingBottom: '0.3rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { color: '#333', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.4rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #0d0d0d', whiteSpace: 'nowrap' },
  td: { color: '#bbb', padding: '0.5rem 0.75rem', borderBottom: '1px solid #070707' },
  tr: {},
  dim: { color: '#333' },
}
