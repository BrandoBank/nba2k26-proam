import { describe, it, expect, vi } from 'vitest'

// shared.js builds its Supabase client when the file loads. These tests only
// cover the helpers that never touch the database, so the client is a stub.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))

import { json, imageHash, statsFingerprint, cleanPlayers, cleanMatchup } from './shared.js'

const b64 = text => Buffer.from(text).toString('base64')

describe('json', () => {
  it('builds a JSON response that is never cached', async () => {
    const res = json(409, { error: 'duplicate_image' })
    expect(res.status).toBe(409)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'duplicate_image' })
  })
})

describe('imageHash', () => {
  it('is the SHA-256 of the decoded image bytes', () => {
    expect(imageHash(b64('hello'))).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('gives the same file the same hash and different files different hashes', () => {
    expect(imageHash(b64('screenshot one'))).toBe(imageHash(b64('screenshot one')))
    expect(imageHash(b64('screenshot one'))).not.toBe(imageHash(b64('screenshot two')))
  })

  it('matches the format add-game accepts', () => {
    expect(imageHash(b64('anything'))).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('statsFingerprint', () => {
  const game = () => ({
    our_score: 62,
    opp_score: 58,
    our_players: [
      { gamertag: 'Bravo', pts: 20, reb: 5, ast: 7, fgm: 8, fga: 15 },
      { gamertag: 'Alpha', pts: 12, reb: 9, ast: 2, fgm: 5, fga: 11 },
    ],
    opp_players: [
      { gamertag: 'Zed', pts: 30, reb: 4, ast: 1, fgm: 12, fga: 20 },
    ],
  })

  it('combines the final score with each player line, sorted by gamertag', () => {
    expect(statsFingerprint(game())).toBe('62-58|alpha:12:9:2:5:11,bravo:20:5:7:8:15,zed:30:4:1:12:20')
  })

  it('does not depend on the order players are listed in', () => {
    const shuffled = game()
    shuffled.our_players.reverse()
    expect(statsFingerprint(shuffled)).toBe(statsFingerprint(game()))
  })

  it('ignores gamertag case and surrounding spaces', () => {
    const messy = game()
    messy.our_players[0].gamertag = '  BRAVO '
    expect(statsFingerprint(messy)).toBe(statsFingerprint(game()))
  })

  it('treats numbers sent as strings the same as numbers', () => {
    const strings = game()
    strings.our_score = '62'
    strings.our_players[0].pts = '20'
    expect(statsFingerprint(strings)).toBe(statsFingerprint(game()))
  })

  it('skips rows with no gamertag', () => {
    const padded = game()
    padded.our_players.push({ gamertag: '', pts: 0 }, { gamertag: '   ' }, null)
    expect(statsFingerprint(padded)).toBe(statsFingerprint(game()))
  })

  it.each(['pts', 'reb', 'ast', 'fgm', 'fga'])('changes when a player\'s %s changes', stat => {
    const changed = game()
    changed.opp_players[0][stat] += 1
    expect(statsFingerprint(changed)).not.toBe(statsFingerprint(game()))
  })

  it('changes when the final score changes or is flipped', () => {
    const flipped = { ...game(), our_score: 58, opp_score: 62 }
    expect(statsFingerprint(flipped)).not.toBe(statsFingerprint(game()))
  })

  it('does not look at steals, blocks, turnovers, threes or free throws', () => {
    const changed = game()
    Object.assign(changed.our_players[0], { stl: 4, blk: 2, tov: 6, tpm: 3, tpa: 9, ftm: 1, fta: 2 })
    expect(statsFingerprint(changed)).toBe(statsFingerprint(game()))
  })

  it('handles a game with no players or scores', () => {
    expect(statsFingerprint({})).toBe('0-0|')
  })
})

describe('cleanPlayers', () => {
  it('returns no rows for anything that is not a list', () => {
    expect(cleanPlayers(undefined)).toEqual([])
    expect(cleanPlayers(null)).toEqual([])
    expect(cleanPlayers('players')).toEqual([])
    expect(cleanPlayers({ 0: { gamertag: 'A' } })).toEqual([])
  })

  it('normalises a full player row', () => {
    const [row] = cleanPlayers([{
      gamertag: '  KingJ287  ', grade: ' B+ ', matchup_gamertag: ' Zed ', graded_out: true,
      pts: 6, reb: 10, ast: 6, stl: 0, blk: 2, fouls: 1, tov: 3,
      fgm: 2, fga: 8, tpm: 1, tpa: 4, ftm: 1, fta: 1,
    }])
    expect(row).toEqual({
      slot: 1, gamertag: 'KingJ287', grade: 'B+', matchup_gamertag: 'Zed', graded_out: true,
      pts: 6, reb: 10, ast: 6, stl: 0, blk: 2, fouls: 1, tov: 3,
      fgm: 2, fga: 8, tpm: 1, tpa: 4, ftm: 1, fta: 1,
    })
  })

  it('keeps at most five players per side and numbers their slots from 1', () => {
    const rows = cleanPlayers(Array.from({ length: 8 }, (_, i) => ({ gamertag: `P${i}` })))
    expect(rows.map(r => r.gamertag)).toEqual(['P0', 'P1', 'P2', 'P3', 'P4'])
    expect(rows.map(r => r.slot)).toEqual([1, 2, 3, 4, 5])
  })

  it('fills in defaults for an empty or missing row', () => {
    const blank = {
      gamertag: '', grade: null, matchup_gamertag: '', graded_out: false,
      pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fouls: 0, tov: 0,
      fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    }
    expect(cleanPlayers([{}, null])).toEqual([{ slot: 1, ...blank }, { slot: 2, ...blank }])
  })

  it('cuts gamertags to 40 characters and grades to 3', () => {
    const [row] = cleanPlayers([{ gamertag: 'x'.repeat(60), matchup_gamertag: 'y'.repeat(60), grade: 'A+++++' }])
    expect(row.gamertag).toHaveLength(40)
    expect(row.matchup_gamertag).toHaveLength(40)
    expect(row.grade).toBe('A++')
  })

  it.each([
    ['a number sent as a string', '12', 12],
    ['a decimal', 7.9, 7],
    ['a negative number', -4, 0],
    ['a huge number', 5000, 999],
    ['text', 'lots', 0],
    ['null', null, 0],
    ['an object', { $gt: 0 }, 0],
  ])('turns %s into a whole stat between 0 and 999', (_name, input, expected) => {
    expect(cleanPlayers([{ gamertag: 'A', pts: input }])[0].pts).toBe(expected)
  })

  it('only marks a player graded out for a real true', () => {
    const rows = cleanPlayers([{ graded_out: true }, { graded_out: 'true' }, { graded_out: 1 }, {}])
    expect(rows.map(r => r.graded_out)).toEqual([true, false, false, false])
  })

  it('drops any field it does not know about', () => {
    const [row] = cleanPlayers([{ gamertag: 'A', player_id: 'someone-else', is_mvp: true, slot: 99 }])
    expect(row).not.toHaveProperty('player_id')
    expect(row).not.toHaveProperty('is_mvp')
    expect(row.slot).toBe(1)
  })
})

describe('cleanMatchup', () => {
  it('trims both gamertags', () => {
    expect(cleanMatchup({ defender: ' Alpha ', offensive: ' Zed ' })).toEqual({ defender: 'Alpha', offensive: 'Zed' })
  })

  it('returns nothing unless both players are named', () => {
    expect(cleanMatchup(null)).toBeNull()
    expect(cleanMatchup({})).toBeNull()
    expect(cleanMatchup({ defender: 'Alpha' })).toBeNull()
    expect(cleanMatchup({ offensive: 'Zed' })).toBeNull()
  })

  it('cuts gamertags to 40 characters and drops extra fields', () => {
    const m = cleanMatchup({ defender: 'x'.repeat(60), offensive: 'Zed', series_id: 'other' })
    expect(m.defender).toHaveLength(40)
    expect(m).toEqual({ defender: 'x'.repeat(40), offensive: 'Zed' })
  })
})
