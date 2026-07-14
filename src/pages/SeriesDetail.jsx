import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { computeImpactScores } from '../lib/ranking'

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
    // Auto-refresh every 45s while series is in progress
    const interval = setInterval(fetchAll, 45000)
    return () => clearInterval(interval)
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
  const maxWins = Math.ceil(series.format / 2)
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

  return (
    <div style={s.page}>
      <Link to="/" style={s.back}>← All Series</Link>

      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>{series.name}</h1>
          <div style={s.meta}>{series.our_team_name} vs {series.opp_team_name}</div>
          {series.storyline && <div style={s.storyline}>{series.storyline}</div>}
        </div>
        <div style={s.scoreBlock}>
          <span style={s.score}>{wins}–{losses}</span>
          <span style={{...s.statusBadge, background: series.status === 'complete' ? '#1a3a1a' : '#1a2a3a', color: series.status === 'complete' ? '#4caf50' : '#4da6ff'}}>
            {series.status === 'complete' ? series.result_label || 'Complete' : 'In Progress'}
          </span>
        </div>
      </div>

      {/* Editor controls */}
      {isEditor && (
        <div style={s.controls}>
          <button onClick={() => navigate(`/series/${id}/add-game`)} style={s.btnPrimary} disabled={seriesOver && series.status !== 'complete'}>
            + Add Game
          </button>
          {series.status === 'in_progress' && seriesOver && (
            <button onClick={markComplete} style={s.btnSuccess}>Mark Complete & Publish</button>
          )}
          {series.status === 'complete' && (
            <button onClick={togglePublish} style={s.btnGhost}>
              {series.published ? 'Unpublish' : 'Publish'}
            </button>
          )}
          <Link to={`/series/${id}/chart`} style={s.btnPrimary}>View Chart</Link>
          {isEditor && <Link to={`/series/${id}/rankings`} style={s.btnSuccess}>Edit Rankings</Link>}
          <Link to={`/series/${id}/accolades`} style={s.btnGhost}>Accolades</Link>
          <button onClick={() => {
            const url = `${window.location.origin}/series/${id}`
            navigator.clipboard.writeText(url)
            alert('Share link copied!')
          }} style={s.btnGhost}>Copy Share Link</button>
        </div>
      )}

      {/* Game cards */}
      {games.length > 0 && (
        <div style={s.gameStrip}>
          {games.map(g => (
            <div key={g.id} style={{...s.gameCard, borderLeftColor: g.our_result === 'W' ? '#4caf50' : '#e53935'}}>
              <div style={s.gameLabel}>G{g.game_number} <span style={{color: g.our_result === 'W' ? '#4caf50' : '#e53935'}}>{g.our_result}</span></div>
              <div style={s.gameScore}>{g.our_score} — {g.opp_score}</div>
              <div style={s.gameMargin}>
                {g.our_result === 'W' ? '+' : ''}{g.our_score - g.opp_score}
              </div>
              {g.brando_position && <div style={s.gameBuild}>B: {g.brando_position}</div>}
              <Link to={`/series/${id}/game/${g.id}/matchup`} style={s.matchupLink}>log matchup</Link>
              {isEditor && (
                <Link to={`/series/${id}/game/${g.id}/edit`} style={s.editLink}>edit</Link>
              )}
            </div>
          ))}
        </div>
      )}

      {games.length === 0 && (
        <div style={s.empty}>
          No games yet.{isEditor ? ' Add the first game above.' : ''}
        </div>
      )}

      {/* Matchup CTA */}
      {games.length > 0 && series.status === 'in_progress' && (
        <div style={s.matchupCta}>
          <div style={s.matchupCtaText}>
            <span style={{color: '#f4701b', fontWeight: 700}}>Players:</span> Log who you guarded to improve ranking accuracy.
          </div>
          <div style={s.matchupCtaGames}>
            {games.map(g => (
              <Link key={g.id} to={`/series/${id}/game/${g.id}/matchup`} style={s.matchupCtaBtn}>
                G{g.game_number}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Live Rankings */}
      {liveRankings.length > 0 && (
        <div style={s.rankingWrap}>
          <div style={s.rankingHeader}>
            <div style={s.rankingTitle}>
              {liveRankings[0]?.finalized
                ? <span style={s.finalBadge}>FINAL RANKINGS</span>
                : <span style={s.liveBadge}>LIVE RANKINGS</span>
              }
              {series.name}
            </div>
            <div style={s.rankingMeta}>
              {liveRankings[0]?.finalized
                ? 'Finalized — '
                : 'Auto-updates as stats & matchups come in · '
              }
              {lastUpdated && `Last refreshed ${lastUpdated.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`}
              {!liveRankings[0]?.finalized && (
                <button onClick={fetchAll} style={s.refreshBtn}>Refresh</button>
              )}
            </div>
          </div>
          {TIER_ORDER.map(tier => {
            const players = liveRankings.filter(r => r.tier === tier)
            if (players.length === 0) return null
            return (
              <div key={tier} style={{...s.tierRow, borderLeftColor: TIER_COLORS[tier]}}>
                <div style={{...s.tierTag, color: TIER_COLORS[tier]}}>{tier === 'G_TIER' ? 'G TIER' : tier}</div>
                <div style={s.tierPlayers}>
                  {players.map(r => (
                    <div key={r.player_id} style={s.rankPlayer}>
                      {r.is_mvp && <span style={s.mvpStar}>★</span>}
                      <span style={{color: r.primary_side === 'our' ? '#4da6ff' : '#ff6b6b', fontWeight: 700}}>
                        {r.display_name || r.gamertag}
                      </span>
                      <span style={s.impactScore}>{Number(r.impact_score || 0).toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {!liveRankings[0]?.finalized && isEditor && (
            <div style={s.rankingFooter}>
              Rankings are auto-computed. <Link to={`/series/${id}/rankings`} style={{color: '#f4701b', textDecoration: 'none'}}>Open editor to adjust & publish →</Link>
            </div>
          )}
          {liveRankings[0]?.finalized && (
            <div style={s.rankingFooter}>
              <Link to={`/series/${id}/chart`} style={{color: '#f4701b', textDecoration: 'none'}}>View full chart & download PNG →</Link>
            </div>
          )}
        </div>
      )}

      {/* Stats table */}
      {stats.length > 0 && (
        <div style={s.tableWrap}>
          <StatsTable players={ourStats} teamName={series.our_team_name} side="our" />
          {oppStats.length > 0 && (
            <StatsTable players={oppStats} teamName={series.opp_team_name} side="opp" />
          )}
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

function StatsTable({ players, teamName, side }) {
  return (
    <div style={{marginBottom: '2rem'}}>
      <div style={{...s.teamLabel, color: side === 'our' ? '#4da6ff' : '#ff6b6b'}}>{teamName}</div>
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
                  {p.gamertag}
                  {p.display_name && p.display_name !== p.gamertag && (
                    <span style={{color:'#555', fontWeight:400, marginLeft:6, fontSize:'0.8rem'}}>({p.display_name})</span>
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
  back: { color: '#555', textDecoration: 'none', fontSize: '0.82rem', display: 'block', marginBottom: '1.5rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' },
  title: { margin: '0 0 0.25rem', fontSize: '1.4rem', letterSpacing: '0.08em' },
  meta: { color: '#555', fontSize: '0.82rem', marginBottom: '0.4rem' },
  storyline: { color: '#aaa', fontSize: '0.9rem', fontStyle: 'italic', maxWidth: 600 },
  scoreBlock: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' },
  score: { fontSize: '2rem', fontWeight: 700, color: '#fff' },
  statusBadge: { fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  controls: { display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' },
  btnPrimary: { background: '#1d6ef5', color: '#fff', border: 'none', borderRadius: 4, padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' },
  btnSuccess: { background: '#1a4a1a', color: '#4caf50', border: '1px solid #2d6a2d', borderRadius: 4, padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' },
  btnGhost: { background: 'transparent', color: '#888', border: '1px solid #333', borderRadius: 4, padding: '0.5rem 1rem', fontSize: '0.9rem', cursor: 'pointer' },
  gameStrip: { display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' },
  gameCard: { background: '#0d0d0d', border: '1px solid #1e1e1e', borderLeft: '3px solid', borderRadius: 4, padding: '0.75rem 1rem', minWidth: 110 },
  gameLabel: { fontSize: '0.8rem', color: '#888', marginBottom: '0.25rem', fontWeight: 600 },
  gameScore: { fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '0.15rem' },
  gameMargin: { fontSize: '0.75rem', color: '#666' },
  gameBuild: { fontSize: '0.72rem', color: '#555', marginTop: '0.2rem' },
  editLink: { display: 'block', fontSize: '0.7rem', color: '#1d6ef5', textDecoration: 'none', marginTop: '0.2rem' },
  matchupLink: { display: 'block', fontSize: '0.7rem', color: '#f4701b', textDecoration: 'none', marginTop: '0.4rem' },
  empty: { color: '#444', textAlign: 'center', padding: '3rem 0' },

  matchupCta: { background: '#0a0500', border: '1px solid #1a1000', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' },
  matchupCtaText: { fontSize: '0.85rem', color: '#888' },
  matchupCtaGames: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  matchupCtaBtn: { background: '#0d0800', border: '1px solid #2a1800', borderRadius: 4, padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#f4701b', fontWeight: 700, textDecoration: 'none' },

  rankingWrap: { background: '#050505', border: '1px solid #111', borderRadius: 10, padding: '1.25rem', marginBottom: '2rem' },
  rankingHeader: { marginBottom: '1rem' },
  rankingTitle: { fontWeight: 800, fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.3rem' },
  rankingMeta: { color: '#333', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  liveBadge: { background: '#0a1a0a', border: '1px solid #1a4a1a', color: '#4caf50', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', padding: '0.15rem 0.5rem', borderRadius: 3 },
  finalBadge: { background: '#1a1200', border: '1px solid #4a3000', color: '#f4701b', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', padding: '0.15rem 0.5rem', borderRadius: 3 },
  refreshBtn: { background: 'transparent', border: 'none', color: '#4da6ff', fontSize: '0.72rem', cursor: 'pointer', padding: 0 },
  tierRow: { display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '3px solid', paddingLeft: '0.75rem', marginBottom: '0.6rem' },
  tierTag: { fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', minWidth: 52 },
  tierPlayers: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
  rankPlayer: { display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#0a0a0a', border: '1px solid #111', borderRadius: 5, padding: '0.25rem 0.6rem', fontSize: '0.82rem' },
  mvpStar: { color: '#f59e0b', fontSize: '0.75rem' },
  impactScore: { color: '#333', fontSize: '0.72rem', marginLeft: 2 },
  rankingFooter: { marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #111', color: '#444', fontSize: '0.78rem' },

  tableWrap: { marginTop: '2rem' },
  teamLabel: { fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' },
  th: { color: '#555', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.4rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #1a1a1a', whiteSpace: 'nowrap' },
  td: { color: '#ccc', padding: '0.5rem 0.75rem', borderBottom: '1px solid #0f0f0f' },
  tr: { transition: 'background 0.1s' },
  dim: { color: '#555' },
}
