/**
 * Deterministic Impact Score Engine — Next Up Series
 *
 * SCORING WEIGHTS (must sum to ~1.0 before sample size multiplier):
 *   Efficiency (FG%):     0.22  — normalized, 60% = 100 pts
 *   Three-point (3P%):    0.08  — only if total_tpa >= 3, else 0 (redistributed to efficiency)
 *   Scoring (PPG):        0.18  — normalized against group max
 *   Playmaking (APG):     0.14  — normalized against group max
 *   Rebounding (RPG):     0.08  — normalized against group max
 *   Defense (STL*2+BLK):  0.16  — composite, normalized against group max
 *   Turnovers (TOV/G):    0.10  — inverted (lower is better), normalized
 *
 *   Sample size multiplier: gp/max_gp, clamped to [0.7, 1.0]
 *   Win side bonus: +3 points if primary_side === 'our', applied after multiplier
 */

// Normalize a value to [0,100] given a max. Returns 0 if max is 0.
function normalize(value, max) {
  if (!max || max === 0) return 0
  return Math.min(100, Math.max(0, (value / max) * 100))
}

// Normalize FG%/3P% where 60% = 100 pts (linear, not capped by group max)
function normalizePct(pct) {
  // 60% maps to 100, 0% maps to 0; values above 60% still cap at 100
  return Math.min(100, Math.max(0, (pct / 60) * 100))
}

export function computeImpactScores(playerStats) {
  if (!playerStats || playerStats.length === 0) return []

  const players = playerStats.map(p => ({ ...p }))

  // Compute group maxes for relative normalization
  const maxPPG = Math.max(...players.map(p => p.ppg || 0))
  const maxAPG = Math.max(...players.map(p => p.apg || 0))
  const maxRPG = Math.max(...players.map(p => p.rpg || 0))
  const maxDef = Math.max(...players.map(p => ((p.spg || 0) * 2 + (p.bpg || 0))))
  const maxTOV = Math.max(...players.map(p => p.tovpg || 0))
  const maxGP  = Math.max(...players.map(p => p.gp || 0))

  // Assign raw impact scores
  for (const p of players) {
    const defComposite = (p.spg || 0) * 2 + (p.bpg || 0)

    // Efficiency — FG% normalized on absolute scale (60% = 100)
    const effScore = normalizePct((p.fg_pct || 0) * 100)

    // Three-point — only counts if enough attempts
    const hasThrees = (p.total_tpa || 0) >= 3
    const threeScore = hasThrees ? normalizePct((p.three_pct || 0) * 100) : 0

    // Scoring — relative to group
    const scoringScore = normalize(p.ppg || 0, maxPPG)

    // Playmaking — relative to group
    const playmakingScore = normalize(p.apg || 0, maxAPG)

    // Rebounding — relative to group
    const reboundingScore = normalize(p.rpg || 0, maxRPG)

    // Defense — relative to group
    const defenseScore = normalize(defComposite, maxDef)

    // Turnovers — inverted: lower TOV is better
    // If nobody turns it over, everyone gets full credit
    const tovScore = maxTOV > 0
      ? normalize(maxTOV - (p.tovpg || 0), maxTOV)
      : 100

    // Weighted raw score (out of 100)
    // When no 3P attempts, redistribute that 0.08 weight to efficiency
    const threeWeight = hasThrees ? 0.08 : 0
    const effWeight   = hasThrees ? 0.22 : 0.30

    const rawScore =
      effScore        * effWeight      +
      threeScore      * threeWeight    +
      scoringScore    * 0.18           +
      playmakingScore * 0.14           +
      reboundingScore * 0.08           +
      defenseScore    * 0.16           +
      tovScore        * 0.10

    // Sample size multiplier [0.7, 1.0]
    const sampleMult = maxGP > 0
      ? Math.min(1.0, Math.max(0.7, (p.gp || 0) / maxGP * 1.0 * 0.3 + 0.7))
      : 0.7

    // Apply multiplier
    let impact = rawScore * sampleMult

    // Win side bonus
    if (p.primary_side === 'our') {
      impact += 3
    }

    // Clamp to [0, 100]
    p.impact_score = Math.min(100, Math.max(0, Math.round(impact * 10) / 10))
  }

  // Sort by impact_score descending for tier assignment
  players.sort((a, b) => b.impact_score - a.impact_score)

  // Assign raw tiers
  for (const p of players) {
    if (p.impact_score >= 75) p.tier = 'ELITE'
    else if (p.impact_score >= 55) p.tier = 'STRONG'
    else if (p.impact_score >= 35) p.tier = 'SOLID'
    else p.tier = 'G_TIER'
  }

  // Sanity pass — if a lower-tier player is within 2 pts of upper-tier player, promote
  // We scan adjacent pairs after sort
  const tierOrder = ['ELITE', 'STRONG', 'SOLID', 'G_TIER']
  for (let i = 0; i < players.length - 1; i++) {
    const upper = players[i]
    const lower = players[i + 1]
    if (upper.tier !== lower.tier) {
      const gap = upper.impact_score - lower.impact_score
      if (gap <= 2) {
        // Promote lower player to upper's tier
        lower.tier = upper.tier
      }
    }
  }

  // Assign rank_in_tier (1-based, sorted by impact_score desc within tier)
  const tierGroups = {}
  for (const p of players) {
    if (!tierGroups[p.tier]) tierGroups[p.tier] = []
    tierGroups[p.tier].push(p)
  }
  for (const tier of Object.keys(tierGroups)) {
    tierGroups[tier].sort((a, b) => b.impact_score - a.impact_score)
    tierGroups[tier].forEach((p, i) => { p.rank_in_tier = i + 1 })
  }

  // MVP: highest impact_score among 'our' side players
  const ourPlayers = players.filter(p => p.primary_side === 'our')
  const mvpPool = ourPlayers.length > 0 ? ourPlayers : players
  const mvpScore = Math.max(...mvpPool.map(p => p.impact_score))
  for (const p of players) {
    p.is_mvp = mvpPool.includes(p) && p.impact_score === mvpScore
  }

  // Tags
  for (const p of players) {
    const tags = []
    // BUILD tag if player has a non-standard position indicator (is_swing = false but could be non-default)
    // We use is_swing for SWING; for BUILD we check if primary_side suggests an atypical role
    // Since we don't have a direct "position" field, BUILD = non-default: flag if not swing and not a standard role
    // Based on schema, we'll use BUILD if player has an explicit non-default assignment indicator
    // (no direct field, so we skip BUILD unless is_swing is false and they have unusual stat profile)
    // Keeping BUILD as a placeholder for future positional data
    if (p.is_swing) tags.push('SWING')
    if (maxGP > 0 && (p.gp || 0) < maxGP) tags.push(`GP:${p.gp}`)
    // NEW placeholder — for series where player hasn't appeared before (external check would set this)
    // tags.push('NEW') — left as placeholder per spec
    p.tags = tags
  }

  // Impact note prompt — short descriptor of what drove their score
  for (const p of players) {
    const notes = []
    const fgPct = ((p.fg_pct || 0) * 100).toFixed(1)
    const threePct = ((p.three_pct || 0) * 100).toFixed(1)

    if ((p.fg_pct || 0) >= 0.55) notes.push(`elite ${fgPct}% shooting`)
    else if ((p.fg_pct || 0) <= 0.35 && (p.total_fga || 0) > 5) notes.push(`struggled from the field at ${fgPct}%`)

    if ((p.total_tpa || 0) >= 3 && (p.three_pct || 0) >= 0.40) notes.push(`hit ${threePct}% from three`)

    if (maxPPG > 0 && (p.ppg || 0) / maxPPG >= 0.8) notes.push(`led scoring at ${p.ppg} PPG`)
    else if ((p.ppg || 0) >= 15) notes.push(`scored ${p.ppg} PPG`)

    if ((p.apg || 0) >= 6) notes.push(`dished ${p.apg} APG`)
    if ((p.rpg || 0) >= 8) notes.push(`hauled ${p.rpg} RPG`)

    const defComp = (p.spg || 0) * 2 + (p.bpg || 0)
    if (defComp >= 3) notes.push(`disruptive on defense (${p.spg} STL, ${p.bpg} BLK)`)

    if ((p.tovpg || 0) === 0) notes.push('zero turnovers')
    else if ((p.tovpg || 0) >= 3) notes.push(`${p.tovpg} turnovers per game hurt efficiency`)

    if ((p.gp || 0) < maxGP) notes.push(`limited to ${p.gp} of ${maxGP} games`)

    p.impact_note_prompt = notes.length > 0
      ? notes.slice(0, 2).join(' and ') + '.'
      : `contributed ${p.ppg || 0} PPG over ${p.gp} games.`
  }

  return players
}

// Tier label helpers for UI use
export const TIER_LABELS = {
  ELITE: 'ELITE',
  STRONG: 'STRONG',
  SOLID: 'SOLID',
  G_TIER: 'G TIER',
}

export const TIER_ORDER = ['ELITE', 'STRONG', 'SOLID', 'G_TIER']
