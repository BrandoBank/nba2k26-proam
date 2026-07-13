/**
 * Achievement Engine — Next Step Series
 *
 * computeAchievements(careerData, seriesRankings)
 *
 * careerData:      array of career_player_totals rows
 * seriesRankings:  array of series_rankings rows
 *                  (fields: player_id, gamertag, series_id, tier, is_mvp, created_at/series_date)
 *
 * Returns array of achievement objects:
 * { player_id, gamertag, achievement, label, description, earned_at_series, type, icon_key }
 */

// Achievement catalogue — single source of truth for metadata
export const ACHIEVEMENT_CATALOGUE = {
  first_elite: {
    id: 'first_elite',
    label: 'First ELITE',
    description: 'Earned an ELITE tier finish for the first time.',
    type: 'positive',
    icon_key: 'star',
  },
  back_to_back_elite: {
    id: 'back_to_back_elite',
    label: 'Back-to-Back ELITE',
    description: 'Posted consecutive ELITE tier finishes.',
    type: 'positive',
    icon_key: 'flame',
  },
  hat_trick_elite: {
    id: 'hat_trick_elite',
    label: 'Hat Trick ELITE',
    description: 'Three consecutive ELITE tier finishes — undeniable.',
    type: 'positive',
    icon_key: 'trophy',
  },
  mvp_club: {
    id: 'mvp_club',
    label: 'MVP Club',
    description: 'Named series MVP for the first time.',
    type: 'positive',
    icon_key: 'trophy',
  },
  mvp_dynasty: {
    id: 'mvp_dynasty',
    label: 'MVP Dynasty',
    description: 'Three or more series MVP awards — this is their lobby.',
    type: 'positive',
    icon_key: 'trophy',
  },
  fifty_percent_club: {
    id: 'fifty_percent_club',
    label: '50% Club',
    description: 'Career field goal percentage at or above 50% (min 20 FGA).',
    type: 'positive',
    icon_key: 'target',
  },
  sixty_percent_club: {
    id: 'sixty_percent_club',
    label: '60% Club',
    description: 'Career field goal percentage at or above 60% — elite efficiency (min 20 FGA).',
    type: 'positive',
    icon_key: 'target',
  },
  assist_king: {
    id: 'assist_king',
    label: 'Assist King',
    description: 'Career assists per game at or above 8 (min 3 series).',
    type: 'positive',
    icon_key: 'pass',
  },
  lockdown: {
    id: 'lockdown',
    label: 'Lockdown',
    description: 'Career steals per game at or above 2 (min 3 series).',
    type: 'positive',
    icon_key: 'shield',
  },
  iron_man: {
    id: 'iron_man',
    label: 'Iron Man',
    description: '20 or more career games played — always in the building.',
    type: 'positive',
    icon_key: 'ball',
  },
  g_tier_regular: {
    id: 'g_tier_regular',
    label: 'G Tier Regular',
    description: 'Three or more G TIER finishes. The lobby has noticed.',
    type: 'negative',
    icon_key: 'chart',
  },
  zero_tov_series: {
    id: 'zero_tov_series',
    label: 'Zero-TO Series',
    description: 'Completed a full series without a single turnover.',
    type: 'positive',
    icon_key: 'shield',
  },
  clutch_performer: {
    id: 'clutch_performer',
    label: 'Clutch Performer',
    description: 'Contributed to 5 or more clutch game wins.',
    type: 'positive',
    icon_key: 'flame',
  },
}

/**
 * computeAchievements
 * @param {Object[]} careerData - career_player_totals rows
 * @param {Object[]} seriesRankings - series_rankings rows, must include series_date or created_at for ordering
 * @returns {Object[]} earned achievements
 */
export function computeAchievements(careerData, seriesRankings = []) {
  const earned = []

  // Build per-player ranking history, sorted chronologically
  const playerRankingMap = {}
  for (const r of seriesRankings) {
    if (!r.player_id) continue
    if (!playerRankingMap[r.player_id]) playerRankingMap[r.player_id] = []
    playerRankingMap[r.player_id].push(r)
  }
  // Sort each player's rankings by series date
  for (const pid of Object.keys(playerRankingMap)) {
    playerRankingMap[pid].sort((a, b) => {
      const dateA = a.series_date || a.created_at || ''
      const dateB = b.series_date || b.created_at || ''
      return dateA.localeCompare(dateB)
    })
  }

  function award(player_id, gamertag, achievementId, earned_at_series) {
    const meta = ACHIEVEMENT_CATALOGUE[achievementId]
    if (!meta) return
    earned.push({
      player_id,
      gamertag,
      achievement: achievementId,
      label: meta.label,
      description: meta.description,
      earned_at_series: earned_at_series || null,
      type: meta.type,
      icon_key: meta.icon_key,
    })
  }

  for (const career of careerData) {
    const { player_id, gamertag } = career
    const rankings = playerRankingMap[player_id] || []

    // --- Career stat achievements ---

    const totalFGA = career.total_fga || 0
    const careerFGPct = career.career_fg_pct || (career.total_fgm && totalFGA ? career.total_fgm / totalFGA : null)

    if (careerFGPct !== null && totalFGA >= 20) {
      if (careerFGPct >= 0.60) {
        award(player_id, gamertag, 'sixty_percent_club', null)
      } else if (careerFGPct >= 0.50) {
        award(player_id, gamertag, 'fifty_percent_club', null)
      }
    }

    const careerAPG = career.career_apg || career.apg || 0
    const seriesPlayed = career.series_played || career.total_series || rankings.length
    if (careerAPG >= 8 && seriesPlayed >= 3) {
      award(player_id, gamertag, 'assist_king', null)
    }

    const careerSPG = career.career_spg || career.spg || 0
    if (careerSPG >= 2 && seriesPlayed >= 3) {
      award(player_id, gamertag, 'lockdown', null)
    }

    const careerGP = career.career_gp || career.gp || 0
    if (careerGP >= 20) {
      award(player_id, gamertag, 'iron_man', null)
    }

    // Clutch game wins — field name: clutch_wins or clutch_game_wins
    const clutchWins = career.clutch_wins || career.clutch_game_wins || 0
    if (clutchWins >= 5) {
      award(player_id, gamertag, 'clutch_performer', null)
    }

    // --- Series ranking achievements ---

    let mvpCount = 0
    let gTierCount = 0
    let consecutiveElite = 0
    let maxConsecutiveElite = 0
    let firstEliteSeries = null
    let firstMvpSeries = null
    let backToBackSeries = null
    let hatTrickSeries = null
    let hasZeroTOV = false
    let zeroTOVSeries = null

    for (const r of rankings) {
      const seriesId = r.series_id

      // MVP tracking
      if (r.is_mvp) {
        mvpCount++
        if (mvpCount === 1) firstMvpSeries = seriesId
      }

      // G TIER tracking
      if (r.tier === 'G_TIER') {
        gTierCount++
      }

      // ELITE streak tracking
      if (r.tier === 'ELITE') {
        if (!firstEliteSeries) firstEliteSeries = seriesId
        consecutiveElite++
        if (consecutiveElite === 2 && !backToBackSeries) backToBackSeries = seriesId
        if (consecutiveElite === 3 && !hatTrickSeries) hatTrickSeries = seriesId
        if (consecutiveElite > maxConsecutiveElite) maxConsecutiveElite = consecutiveElite
      } else {
        consecutiveElite = 0
      }

      // Zero TOV — check series-level TOV field
      if ((r.tovpg === 0 || r.series_tovpg === 0) && !hasZeroTOV) {
        hasZeroTOV = true
        zeroTOVSeries = seriesId
      }
    }

    // Award tier achievements
    if (firstEliteSeries) {
      award(player_id, gamertag, 'first_elite', firstEliteSeries)
    }
    if (maxConsecutiveElite >= 2) {
      award(player_id, gamertag, 'back_to_back_elite', backToBackSeries)
    }
    if (maxConsecutiveElite >= 3) {
      award(player_id, gamertag, 'hat_trick_elite', hatTrickSeries)
    }

    if (mvpCount >= 1) {
      award(player_id, gamertag, 'mvp_club', firstMvpSeries)
    }
    if (mvpCount >= 3) {
      // Find the 3rd MVP series
      const mvpSeries = rankings.filter(r => r.is_mvp).map(r => r.series_id)
      award(player_id, gamertag, 'mvp_dynasty', mvpSeries[2] || null)
    }

    if (gTierCount >= 3) {
      award(player_id, gamertag, 'g_tier_regular', null)
    }

    if (hasZeroTOV) {
      award(player_id, gamertag, 'zero_tov_series', zeroTOVSeries)
    }
  }

  return earned
}
