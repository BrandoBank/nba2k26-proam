import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { colors } from '../lib/theme'
import { computeImpactScores } from '../lib/ranking'
import { IconStar, IconTrophy, IconFlame } from '../lib/icons'

const TIERS = ['ELITE', 'STRONG', 'SOLID', 'G_TIER']
const TIER_COLORS = { ELITE: colors.elite, STRONG: colors.strong, SOLID: colors.solid, G_TIER: colors.gTier }

export default function RankingEditor() {
  const { id: seriesId } = useParams()
  const { isEditor } = useAuth()
  const navigate = useNavigate()

  const [series, setSeries] = useState(null)
  const [stats, setStats] = useState([])
  const [rows, setRows] = useState([]) // working ranking rows
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (isEditor) fetchData() }, [seriesId, isEditor])

  async function fetchData() {
    const [{ data: ser }, { data: sts }, { data: existing }] = await Promise.all([
      supabase.from('series').select('*').eq('id', seriesId).single(),
      supabase.from('series_player_stats').select('*').eq('series_id', seriesId),
      supabase.from('series_rankings').select('*, players(gamertag,display_name)').eq('series_id', seriesId),
    ])
    setSeries(ser)
    setStats(sts || [])

    if (existing && existing.length > 0) {
      // Load existing rankings
      setRows(existing.map(r => ({
        player_id: r.player_id,
        gamertag: r.players?.gamertag || '',
        display_name: r.players?.display_name,
        tier: r.tier,
        rank_in_tier: r.rank_in_tier,
        is_mvp: r.is_mvp,
        primary_side: r.primary_side,
        tags: r.tags || [],
        impact_note: r.impact_note || '',
        impact_score: r.impact_score || 0,
        finalized: r.finalized,
      })))
    } else if (sts && sts.length > 0) {
      // Run deterministic engine
      const computed = computeImpactScores(sts)
      setRows(computed.map(p => ({
        player_id: p.player_id,
        gamertag: p.gamertag,
        display_name: p.display_name,
        tier: p.tier,
        rank_in_tier: p.rank_in_tier,
        is_mvp: p.is_mvp,
        primary_side: p.primary_side,
        tags: p.tags || [],
        impact_note: p.impact_note_prompt || '',
        impact_score: p.impact_score,
        finalized: false,
      })))
    }
    setLoading(false)
  }

  async function runAiDraft() {
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch('/.netlify/functions/rank-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          series_id: seriesId,
          stats,
          series_info: {
            name: series.name,
            our_team_name: series.our_team_name,
            opp_team_name: series.opp_team_name,
            our_wins: series.our_wins,
            opp_wins: series.opp_wins,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'AI draft failed')

      // Merge AI results into rows
      setRows(prev => prev.map(row => {
        const aiRow = data.rankings?.find(r => r.gamertag?.toLowerCase() === row.gamertag.toLowerCase())
        if (!aiRow) return row
        return {
          ...row,
          tier: aiRow.tier || row.tier,
          rank_in_tier: aiRow.rank_in_tier || row.rank_in_tier,
          is_mvp: aiRow.is_mvp ?? row.is_mvp,
          tags: aiRow.tags || row.tags,
          impact_note: aiRow.impact_note || row.impact_note,
        }
      }))
    } catch (err) {
      setAiError(err.message)
    }
    setAiLoading(false)
  }

  function updateRow(player_id, field, value) {
    setRows(prev => prev.map(r => r.player_id === player_id ? { ...r, [field]: value } : r))
  }

  function setMvp(player_id) {
    setRows(prev => prev.map(r => ({ ...r, is_mvp: r.player_id === player_id })))
  }

  async function handleSave(finalize = false) {
    setSaving(true)
    setSaved(false)

    // Recalculate rank_in_tier
    const tierCounts = {}
    const finalRows = rows.map(r => {
      if (!tierCounts[r.tier]) tierCounts[r.tier] = 0
      tierCounts[r.tier]++
      return { ...r, rank_in_tier: tierCounts[r.tier] }
    })

    const upsertRows = finalRows.map(r => ({
      series_id: seriesId,
      player_id: r.player_id,
      tier: r.tier,
      rank_in_tier: r.rank_in_tier,
      is_mvp: r.is_mvp,
      primary_side: r.primary_side,
      tags: r.tags,
      impact_note: r.impact_note,
      impact_score: r.impact_score,
      finalized: finalize,
    }))

    const { error } = await supabase.from('series_rankings')
      .upsert(upsertRows, { onConflict: 'series_id,player_id' })

    setSaving(false)
    if (error) { setAiError(error.message); return }
    setSaved(true)
    if (finalize) navigate(`/series/${seriesId}/chart`)
  }

  if (!isEditor) return <div style={s.page}><p style={s.dim}>Editor access required.</p></div>
  if (loading) return <div style={s.page}><p style={s.dim}>Loading...</p></div>

  const tierGroups = {}
  TIERS.forEach(t => { tierGroups[t] = rows.filter(r => r.tier === t) })

  return (
    <div style={s.page}>
      <Link to={`/series/${seriesId}`} style={s.back}>← Back to Series</Link>

      <div style={s.header}>
        <div>
          <div style={s.eyebrow}><IconTrophy size={13} color={colors.gold} /> RANKING EDITOR</div>
          <h1 style={s.title}>{series?.name}</h1>
        </div>
        <div style={s.headerActions}>
          <button onClick={runAiDraft} disabled={aiLoading} style={s.btnBlue}>
            {aiLoading ? 'AI Drafting...' : '⚡ AI Draft'}
          </button>
          <button onClick={() => handleSave(false)} disabled={saving} style={s.btnGhost}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving} style={s.btnOrange}>
            Publish Rankings →
          </button>
        </div>
      </div>

      {aiError && <p style={s.error}>{aiError}</p>}
      {saved && <p style={s.success}>Saved.</p>}

      <p style={s.hint}>
        Drag rows between tiers to reorder. Click ★ to set MVP. Edit impact notes inline.
        Hit "AI Draft" to get Claude's take — then adjust before publishing.
      </p>

      {TIERS.map(tier => {
        const tierColor = TIER_COLORS[tier]
        const tierRows = tierGroups[tier]
        return (
          <div key={tier} style={{ ...s.tierBlock, borderLeftColor: tierColor }}>
            <div style={{ ...s.tierLabel, color: tierColor }}>
              {tier === 'G_TIER' ? 'G TIER' : tier}
              <span style={s.tierCount}>{tierRows.length} player{tierRows.length !== 1 ? 's' : ''}</span>
            </div>

            {tierRows.length === 0 && (
              <div style={s.emptyTier}>No players — move rows here by changing their tier</div>
            )}

            {tierRows.map(row => (
              <div key={row.player_id} style={s.rankRow}>
                <div style={s.rankLeft}>
                  <button
                    onClick={() => setMvp(row.player_id)}
                    style={{ ...s.mvpBtn, color: row.is_mvp ? colors.gold : '#333' }}
                    title="Set as MVP"
                  >
                    <IconStar size={14} color={row.is_mvp ? colors.gold : '#333'} filled={row.is_mvp} />
                  </button>

                  <div style={s.rankPlayer}>
                    <div style={s.rankName}>{row.gamertag}</div>
                    <div style={s.rankScore}>Impact: {Number(row.impact_score || 0).toFixed(1)}</div>
                  </div>

                  <select
                    style={s.tierSelect}
                    value={row.tier}
                    onChange={e => updateRow(row.player_id, 'tier', e.target.value)}
                  >
                    {TIERS.map(t => <option key={t} value={t}>{t === 'G_TIER' ? 'G TIER' : t}</option>)}
                  </select>

                  <div style={s.tagRow}>
                    {(row.tags || []).map((tag, i) => (
                      <span key={i} style={s.tag}>{tag}</span>
                    ))}
                  </div>
                </div>

                <textarea
                  style={s.noteInput}
                  value={row.impact_note}
                  onChange={e => updateRow(row.player_id, 'impact_note', e.target.value)}
                  placeholder="Impact note — write the blurb that appears in the chart..."
                  rows={2}
                />
              </div>
            ))}
          </div>
        )
      })}

      <div style={s.bottomActions}>
        <button onClick={() => handleSave(false)} disabled={saving} style={s.btnGhost}>Save Draft</button>
        <button onClick={() => handleSave(true)} disabled={saving} style={s.btnOrange}>
          Publish & View Chart →
        </button>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#000', color: '#fff', padding: '2rem', maxWidth: 1000, margin: '0 auto', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  back: { color: '#444', textDecoration: 'none', fontSize: '0.8rem', display: 'block', marginBottom: '1.5rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 6, color: colors.gold, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.4rem' },
  title: { margin: 0, fontSize: '1.3rem', fontWeight: 900 },
  headerActions: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' },
  btnBlue: { background: colors.blue, color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' },
  btnOrange: { background: colors.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' },
  btnGhost: { background: 'transparent', color: '#666', border: '1px solid #222', borderRadius: 6, padding: '0.5rem 1rem', fontSize: '0.85rem', cursor: 'pointer' },
  hint: { color: '#333', fontSize: '0.8rem', margin: '0 0 1.5rem', lineHeight: 1.6 },
  error: { color: colors.gTier, fontSize: '0.82rem', marginBottom: '0.5rem' },
  success: { color: colors.statGreen, fontSize: '0.82rem', marginBottom: '0.5rem' },
  tierBlock: { borderLeft: '3px solid', marginBottom: '1.5rem', paddingLeft: '1rem' },
  tierLabel: { fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' },
  tierCount: { color: '#333', fontWeight: 400, fontSize: '0.72rem', letterSpacing: 0 },
  emptyTier: { color: '#222', fontSize: '0.78rem', padding: '0.5rem 0', fontStyle: 'italic' },
  rankRow: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.75rem', background: '#080808', border: '1px solid #111', borderRadius: 6, padding: '0.75rem', flexWrap: 'wrap' },
  rankLeft: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', flex: '0 0 auto' },
  mvpBtn: { background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.1rem', display: 'flex' },
  rankPlayer: {},
  rankName: { fontWeight: 700, color: '#fff', fontSize: '0.9rem' },
  rankScore: { color: '#444', fontSize: '0.72rem' },
  tierSelect: { background: '#000', border: '1px solid #222', borderRadius: 4, color: '#ccc', padding: '0.25rem 0.4rem', fontSize: '0.78rem', outline: 'none' },
  tagRow: { display: 'flex', gap: '0.3rem', flexWrap: 'wrap' },
  tag: { fontSize: '0.62rem', color: '#555', border: '1px solid #1e1e1e', borderRadius: 3, padding: '0.1rem 0.4rem' },
  noteInput: { flex: 1, minWidth: 250, background: '#000', border: '1px solid #1a1a1a', borderRadius: 5, color: '#ccc', padding: '0.5rem 0.7rem', fontSize: '0.82rem', resize: 'vertical', outline: 'none', lineHeight: 1.5 },
  bottomActions: { display: 'flex', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #111', justifyContent: 'flex-end' },
  dim: { color: '#444' },
}
