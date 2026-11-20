import { describe, it, expect } from 'vitest'
import {
  computeImpactScores,
  computeDefensiveDeltas,
  gradedOutIds,
} from './ranking.js'

/** A player with every stat at zero. Override only what a test is about. */
function player(overrides = {}) {
  return {
    player_id: 'p1',
    gp: 1,
    ppg: 0, apg: 0, rpg: 0, spg: 0, bpg: 0, tovpg: 0,
    fg_pct: 0, three_pct: 0,
    total_fga: 0, total_tpa: 0,
    primary_side: 'opp',
    is_swing: false,
    ...overrides,
  }
}

const byId = (results, id) => results.find(p => p.player_id === id)

/**
 * A lone all-zero player scores exactly 10 (full turnover credit, nothing else),
 * so passing a defensive delta of `target - 10` lands them on any score we want.
 * Real deltas are capped at ±8; this is only a lever for hitting tier boundaries.
 */
function scoreOf(target, overrides = {}) {
  const p = player(overrides)
  return computeImpactScores([p], { [p.player_id]: target - 10 })[0]
}

describe('computeImpactScores', () => {
  describe('input handling', () => {
    it('returns an empty list for no players', () => {
      expect(computeImpactScores([])).toEqual([])
      expect(computeImpactScores(null)).toEqual([])
      expect(computeImpactScores(undefined)).toEqual([])
    })

    it('does not mutate the rows it was given', () => {
      const input = [player()]
      const snapshot = structuredClone(input)
      computeImpactScores(input)
      expect(input).toEqual(snapshot)
    })

    it('treats missing stats as zero', () => {
      const [p] = computeImpactScores([{ player_id: 'p1', gp: 1 }])
      expect(p.impact_score).toBe(10)
    })
  })

  describe('impact score formula', () => {
    it('adds up the weighted components for a single player', () => {
      // Alone in the group, every relative stat normalizes to 100:
      // FG 22 + 3P 8 + scoring 18 + playmaking 14 + rebounding 8 + defense 16 = 86.
      // Turnovers score 0 because this player has the group's worst (only) TOV rate.
      const [p] = computeImpactScores([player({
        gp: 4, ppg: 20, apg: 5, rpg: 5, spg: 1, bpg: 1, tovpg: 2,
        fg_pct: 60, three_pct: 60, total_fga: 40, total_tpa: 10,
      })])
      expect(p.impact_score).toBe(86)
    })

    it('scores FG% on an absolute scale where 60% is full marks', () => {
      const at30 = computeImpactScores([player({ fg_pct: 30 })])[0]
      const at60 = computeImpactScores([player({ fg_pct: 60 })])[0]
      const at90 = computeImpactScores([player({ fg_pct: 90 })])[0]
      // No three-point attempts, so FG% carries the full 0.30 weight.
      expect(at30.impact_score).toBe(10 + 15)
      expect(at60.impact_score).toBe(10 + 30)
      expect(at90.impact_score).toBe(at60.impact_score)
    })

    it('counts 3P% only with at least 3 attempts, otherwise moves its weight to FG%', () => {
      const shooter = { fg_pct: 30, three_pct: 60 }
      const twoAttempts = computeImpactScores([player({ ...shooter, total_tpa: 2 })])[0]
      const threeAttempts = computeImpactScores([player({ ...shooter, total_tpa: 3 })])[0]
      // 2 attempts: FG 50 × 0.30 = 15.          3 attempts: FG 50 × 0.22 + 3P 100 × 0.08 = 19.
      expect(twoAttempts.impact_score).toBe(10 + 15)
      expect(threeAttempts.impact_score).toBe(10 + 19)
    })

    it('scores scoring, playmaking and rebounding relative to the group leader', () => {
      const results = computeImpactScores([
        player({ player_id: 'leader', ppg: 20, apg: 8, rpg: 10 }),
        player({ player_id: 'half', ppg: 10, apg: 4, rpg: 5 }),
      ])
      // Leader: 18 + 14 + 8 = 40. Half the leader's numbers: 20. Both get 10 for zero turnovers.
      expect(byId(results, 'leader').impact_score).toBe(50)
      expect(byId(results, 'half').impact_score).toBe(30)
    })

    it('weights steals double blocks in the defense composite', () => {
      const results = computeImpactScores([
        player({ player_id: 'thief', spg: 2 }),   // composite 4
        player({ player_id: 'blocker', bpg: 2 }), // composite 2
      ])
      expect(byId(results, 'thief').impact_score).toBe(10 + 16)
      expect(byId(results, 'blocker').impact_score).toBe(10 + 8)
    })

    it('rewards fewer turnovers, with zero credit for the group worst', () => {
      const results = computeImpactScores([
        player({ player_id: 'careful', tovpg: 0 }),
        player({ player_id: 'middle', tovpg: 2 }),
        player({ player_id: 'sloppy', tovpg: 4 }),
      ])
      expect(byId(results, 'careful').impact_score).toBe(10)
      expect(byId(results, 'middle').impact_score).toBe(5)
      expect(byId(results, 'sloppy').impact_score).toBe(0)
    })

    it('scales the score down for players who missed games, to a floor of 0.7', () => {
      const results = computeImpactScores([
        player({ player_id: 'full', gp: 4, fg_pct: 60 }),
        player({ player_id: 'half', gp: 2, fg_pct: 60 }),
        player({ player_id: 'none', gp: 0, fg_pct: 60 }),
      ])
      // Raw score is 40 for each. Multiplier is 0.7 + 0.3 × (gp / max gp).
      expect(byId(results, 'full').impact_score).toBe(40)
      expect(byId(results, 'half').impact_score).toBe(34)
      expect(byId(results, 'none').impact_score).toBe(28)
    })

    it('adds 3 points for players on our side', () => {
      const ours = computeImpactScores([player({ primary_side: 'our' })])[0]
      const theirs = computeImpactScores([player({ primary_side: 'opp' })])[0]
      expect(ours.impact_score - theirs.impact_score).toBe(3)
    })

    it('adds the defensive delta and records it on the player', () => {
      const [up] = computeImpactScores([player()], { p1: 4 })
      const [down] = computeImpactScores([player()], { p1: -4 })
      const [none] = computeImpactScores([player()])
      expect(up.impact_score).toBe(14)
      expect(up.defensive_delta).toBe(4)
      expect(down.impact_score).toBe(6)
      expect(none.defensive_delta).toBe(0)
    })

    it('clamps the final score to 0–100', () => {
      expect(scoreOf(250).impact_score).toBe(100)
      expect(scoreOf(-50).impact_score).toBe(0)
    })
  })

  describe('tiers', () => {
    it.each([
      [75, 'ELITE'],
      [74.9, 'STRONG'],
      [58, 'STRONG'],
      [57.9, 'SOLID'],
      [42, 'SOLID'],
      [41.9, 'G_TIER'],
    ])('a score of %s is %s', (score, tier) => {
      const p = scoreOf(score)
      expect(p.impact_score).toBe(score)
      expect(p.tier).toBe(tier)
    })

    it('keeps a low scorer out of G Tier when their per-game impact is at least +1.5', () => {
      // IMP/G here is 0.4 × rebounds.
      const saved = computeImpactScores([player({ rpg: 4 })])[0]
      const notSaved = computeImpactScores([player({ rpg: 3 })])[0]
      expect(saved.impact_score).toBeLessThan(42)
      expect(saved.imp_g).toBe(1.6)
      expect(saved.tier).toBe('SOLID')
      expect(notSaved.imp_g).toBe(1.2)
      expect(notSaved.tier).toBe('G_TIER')
    })

    it('charges 0.9 per shot attempt and 1 per turnover in per-game impact', () => {
      // 10 PPG on 10 FGA/G = +1.0, minus 1 TOV/G = 0.0 → not enough to escape G Tier.
      const results = computeImpactScores([
        player({ player_id: 'chucker', gp: 2, ppg: 10, total_fga: 20, tovpg: 1 }),
        player({ player_id: 'other', gp: 2, ppg: 40 }),
      ])
      const chucker = byId(results, 'chucker')
      expect(chucker.imp_g).toBe(0)
      expect(chucker.tier).toBe('G_TIER')
    })

    it('returns players sorted from highest score to lowest', () => {
      const results = computeImpactScores([
        player({ player_id: 'low', ppg: 5 }),
        player({ player_id: 'high', ppg: 30 }),
        player({ player_id: 'mid', ppg: 15 }),
      ])
      expect(results.map(p => p.player_id)).toEqual(['high', 'mid', 'low'])
    })

    it('numbers players within each tier from 1, best first', () => {
      const results = computeImpactScores(
        [
          player({ player_id: 'elite1' }),
          player({ player_id: 'elite2' }),
          player({ player_id: 'g1' }),
          player({ player_id: 'g2' }),
        ],
        { elite1: 80, elite2: 70, g1: 5, g2: 0 },
      )
      expect(results.map(p => [p.player_id, p.tier, p.rank_in_tier])).toEqual([
        ['elite1', 'ELITE', 1],
        ['elite2', 'ELITE', 2],
        ['g1', 'G_TIER', 1],
        ['g2', 'G_TIER', 2],
      ])
    })
  })

  describe('graded-out players', () => {
    const run = () => computeImpactScores(
      [
        player({ player_id: 'quitter', primary_side: 'our' }),
        player({ player_id: 'teammate', primary_side: 'our' }),
      ],
      { quitter: 80, teammate: 40 },
      new Set(['quitter']),
    )

    it('are forced into G Tier whatever their score', () => {
      const quitter = byId(run(), 'quitter')
      expect(quitter.impact_score).toBeGreaterThanOrEqual(75)
      expect(quitter.tier).toBe('G_TIER')
      expect(quitter.graded_out).toBe(true)
    })

    it('are tagged GRADED OUT', () => {
      expect(byId(run(), 'quitter').tags).toContain('GRADED OUT')
      expect(byId(run(), 'teammate').tags).not.toContain('GRADED OUT')
    })

    it('cannot be MVP, so it passes to the next eligible player', () => {
      const results = run()
      expect(byId(results, 'quitter').is_mvp).toBe(false)
      expect(byId(results, 'teammate').is_mvp).toBe(true)
    })

    it('leave no MVP when everyone graded out', () => {
      const results = computeImpactScores([player()], {}, new Set(['p1']))
      expect(results[0].is_mvp).toBe(false)
    })
  })

  describe('MVP', () => {
    it('goes to the best player on our side, even if an opponent scored higher', () => {
      const results = computeImpactScores(
        [
          player({ player_id: 'oppStar', primary_side: 'opp' }),
          player({ player_id: 'ourBest', primary_side: 'our' }),
          player({ player_id: 'ourOther', primary_side: 'our' }),
        ],
        { oppStar: 80, ourBest: 50, ourOther: 20 },
      )
      expect(results.filter(p => p.is_mvp).map(p => p.player_id)).toEqual(['ourBest'])
    })

    it('falls back to the top scorer overall when nobody is on our side', () => {
      const results = computeImpactScores(
        [player({ player_id: 'a' }), player({ player_id: 'b' })],
        { a: 30, b: 60 },
      )
      expect(results.filter(p => p.is_mvp).map(p => p.player_id)).toEqual(['b'])
    })
  })

  describe('tags', () => {
    it('tags swing players', () => {
      expect(computeImpactScores([player({ is_swing: true })])[0].tags).toEqual(['SWING'])
      expect(computeImpactScores([player()])[0].tags).toEqual([])
    })

    it('tags games played only for players who missed games', () => {
      const results = computeImpactScores([
        player({ player_id: 'full', gp: 5 }),
        player({ player_id: 'partial', gp: 3 }),
      ])
      expect(byId(results, 'full').tags).toEqual([])
      expect(byId(results, 'partial').tags).toEqual(['GP:3'])
    })
  })
})

describe('computeDefensiveDeltas', () => {
  const seriesStats = [{ player_id: 'scorer', ppg: 20 }]
  const game = (game_id, pts) => ({ game_id, player_id: 'scorer', pts })
  const guard = (game_id, defender = 'defender') => ({
    game_id, defender_player_id: defender, offensive_player_id: 'scorer',
  })

  it('returns nothing when any input is missing or empty', () => {
    expect(computeDefensiveDeltas([], [game('g1', 10)], seriesStats)).toEqual({})
    expect(computeDefensiveDeltas([guard('g1')], [], seriesStats)).toEqual({})
    expect(computeDefensiveDeltas([guard('g1')], [game('g1', 10)], [])).toEqual({})
    expect(computeDefensiveDeltas(null, null, null)).toEqual({})
  })

  it('gives 4 impact points for every 5 points held below the scorer average', () => {
    expect(computeDefensiveDeltas([guard('g1')], [game('g1', 15)], seriesStats))
      .toEqual({ defender: 4 })
  })

  it('goes negative when the matchup scores above their average', () => {
    expect(computeDefensiveDeltas([guard('g1')], [game('g1', 25)], seriesStats))
      .toEqual({ defender: -4 })
  })

  it('caps the bonus at +8 and the penalty at -8', () => {
    expect(computeDefensiveDeltas([guard('g1')], [game('g1', 0)], seriesStats))
      .toEqual({ defender: 8 })
    expect(computeDefensiveDeltas([guard('g1')], [game('g1', 50)], seriesStats))
      .toEqual({ defender: -8 })
  })

  it('averages across every game the defender guarded them', () => {
    // Held to 15 (−5) and 20 (0): average 2.5 below → 2.0 impact points.
    const result = computeDefensiveDeltas(
      [guard('g1'), guard('g2')],
      [game('g1', 15), game('g2', 20)],
      seriesStats,
    )
    expect(result).toEqual({ defender: 2 })
  })

  it('tracks each defender separately', () => {
    const result = computeDefensiveDeltas(
      [guard('g1', 'd1'), guard('g2', 'd2')],
      [game('g1', 15), game('g2', 25)],
      seriesStats,
    )
    expect(result).toEqual({ d1: 4, d2: -4 })
  })

  it('skips matchups it cannot score', () => {
    const matchups = [
      { game_id: 'g1', defender_player_id: null, offensive_player_id: 'scorer' },
      { game_id: 'g1', defender_player_id: 'defender', offensive_player_id: null },
      guard('missing-game'),
      { game_id: 'g1', defender_player_id: 'defender', offensive_player_id: 'unknown' },
    ]
    expect(computeDefensiveDeltas(matchups, [game('g1', 15)], seriesStats)).toEqual({})
  })
})

describe('gradedOutIds', () => {
  it('collects the players who graded out in any game', () => {
    const ids = gradedOutIds([
      { player_id: 'a', graded_out: true },
      { player_id: 'b', graded_out: false },
      { player_id: 'a', graded_out: true },
      { player_id: 'c' },
    ])
    expect([...ids]).toEqual(['a'])
  })

  it('returns an empty set for no rows', () => {
    expect(gradedOutIds().size).toBe(0)
    expect(gradedOutIds(null).size).toBe(0)
  })
})
