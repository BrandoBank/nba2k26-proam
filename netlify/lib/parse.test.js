import { describe, it, expect, vi } from 'vitest'
import { rowToPlayer, toTeams, validateBoxScore, estimateCost, parseBoxScore } from './parse.js'

/** The model's raw output for a box score where every check passes. */
function rawBoxScore() {
  return {
    team_top: {
      name: 'Top Squad',
      score: 16,
      rows: [
        'Alpha | A | you | 10 5 3 1 0 2 1 | 4/8 | 1/3 | 1/2',
        'Bravo | B | none | 6 4 2 0 1 1 2 | 3/6 | 0/1 | 0/0',
      ],
      total: '16 9 5 1 1 3 3 | 7/14 | 1/4 | 1/2',
    },
    team_bottom: {
      name: 'Bottom Squad',
      score: 12,
      rows: [
        'Carl | C+ | matchup | 8 2 1 0 0 3 2 | 3/7 | 2/4 | 0/0',
        'Dana | null | none | 4 6 0 2 1 0 0 | 2/5 | 0/0 | 0/2',
      ],
      total: '12 8 1 2 1 3 2 | 5/12 | 2/4 | 0/2',
    },
  }
}

const validBoxScore = () => toTeams(rawBoxScore())

describe('rowToPlayer', () => {
  it('splits a row into gamertag, grade, marker and every stat', () => {
    expect(rowToPlayer('KingJ287 | B+ | none | 6 10 6 0 2 1 3 | 2/8 | 1/4 | 1/1')).toEqual({
      gamertag: 'KingJ287',
      grade: 'B+',
      marker: 'none',
      pts: 6, reb: 10, ast: 6, stl: 0, blk: 2, fouls: 1, tov: 3,
      fgm: 2, fga: 8, tpm: 1, tpa: 4, ftm: 1, fta: 1,
    })
  })

  it('tolerates uneven spacing around cells and numbers', () => {
    const p = rowToPlayer('  Tag_1|A|none|  6   10 6 0 2 1 3  |2/8|1/4|1/1')
    expect(p.gamertag).toBe('Tag_1')
    expect(p.reb).toBe(10)
    expect(p.fta).toBe(1)
  })

  it('keeps the gamertag exactly as printed', () => {
    expect(rowToPlayer('x_O0l1I_x | A | none | 0 0 0 0 0 0 0 | 0/0 | 0/0 | 0/0').gamertag).toBe('x_O0l1I_x')
  })

  it.each(['null', 'NULL', '--', '-', 'n/a', 'N/A', ''])('reads a grade of "%s" as no grade', grade => {
    expect(rowToPlayer(`Tag | ${grade} | none | 0 0 0 0 0 0 0 | 0/0 | 0/0 | 0/0`).grade).toBeNull()
  })

  it.each([
    ['you', 'you'],
    ['YOU', 'you'],
    ['matchup', 'matchup'],
    ['your matchup', 'matchup'],
    ['none', 'none'],
    ['', 'none'],
    ['something else', 'none'],
  ])('reads a marker of "%s" as %s', (marker, expected) => {
    expect(rowToPlayer(`Tag | A | ${marker} | 0 0 0 0 0 0 0 | 0/0 | 0/0 | 0/0`).marker).toBe(expected)
  })

  it('reads a blank shooting cell as 0 made, 0 attempted', () => {
    const p = rowToPlayer('Tag | A | none | 0 0 0 0 0 0 0 | 0/0 |  | 0/0')
    expect(p.tpm).toBe(0)
    expect(p.tpa).toBe(0)
  })

  it('reads a non-numeric counting stat as 0', () => {
    const p = rowToPlayer('Tag | A | none | 6 -- 6 0 2 1 3 | 2/8 | 1/4 | 1/1')
    expect(p.reb).toBe(0)
    expect(p.ast).toBe(6)
  })

  it('rejects a row with missing columns', () => {
    expect(() => rowToPlayer('Tag | A | none | 6 10 6 0 2 1 3 | 2/8')).toThrow('Malformed row')
  })
})

describe('toTeams', () => {
  it('converts both teams, their players and their TOTAL rows', () => {
    const { team_top, team_bottom } = validBoxScore()
    expect(team_top.name).toBe('Top Squad')
    expect(team_top.score).toBe(16)
    expect(team_top.players.map(p => p.gamertag)).toEqual(['Alpha', 'Bravo'])
    expect(team_top.totals).toEqual({
      pts: 16, reb: 9, ast: 5, stl: 1, blk: 1, fouls: 3, tov: 3,
      fgm: 7, fga: 14, tpm: 1, tpa: 4, ftm: 1, fta: 2,
    })
    expect(team_bottom.players.map(p => p.marker)).toEqual(['matchup', 'none'])
    expect(team_bottom.totals.pts).toBe(12)
  })
})

describe('validateBoxScore', () => {
  it('passes a box score where everything reconciles', () => {
    expect(validateBoxScore(validBoxScore())).toEqual([])
  })

  it.each([
    ['more field goals made than attempted', p => { p.fgm = 9 }, 'top team Alpha: FGM 9 > FGA 8'],
    ['more threes made than attempted', p => { p.tpm = 4 }, 'top team Alpha: 3PM 4 > 3PA 3'],
    ['more free throws made than attempted', p => { p.ftm = 3 }, 'top team Alpha: FTM 3 > FTA 2'],
    ['more threes made than field goals made', p => { p.tpm = 5; p.tpa = 6 }, 'top team Alpha: 3PM 5 > FGM 4'],
  ])('flags %s', (_name, breakIt, message) => {
    const box = validBoxScore()
    breakIt(box.team_top.players[0])
    expect(validateBoxScore(box)).toContain(message)
  })

  it('flags points that do not match the shooting line', () => {
    const box = validBoxScore()
    box.team_top.players[0].pts = 12
    expect(validateBoxScore(box)).toContain('top team Alpha: PTS 12 but 2×4 FGM + 1 3PM + 1 FTM = 10')
  })

  it.each(['pts', 'reb', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta'])(
    'flags a %s column that does not add up to the TOTAL row',
    col => {
      const box = validBoxScore()
      const printed = box.team_bottom.totals[col]
      box.team_bottom.totals[col] = printed + 1
      expect(validateBoxScore(box)).toContain(
        `bottom team: ${col.toUpperCase()} column sums to ${printed} but TOTAL row says ${printed + 1}`,
      )
    },
  )

  it('ignores fouls and turnovers that do not add up, since 2K counts team ones in the TOTAL', () => {
    const box = validBoxScore()
    box.team_top.totals.fouls += 4
    box.team_top.totals.tov += 2
    expect(validateBoxScore(box)).toEqual([])
  })

  it('flags a TOTAL row whose points differ from the final score', () => {
    const box = validBoxScore()
    box.team_top.score = 18
    expect(validateBoxScore(box)).toEqual(['top team: TOTAL PTS 16 ≠ final score 18'])
  })

  it('flags a team with no player rows and still checks the other team', () => {
    const box = validBoxScore()
    box.team_top.players = []
    box.team_bottom.score = 99
    expect(validateBoxScore(box)).toEqual([
      'top team: no player rows',
      'bottom team: TOTAL PTS 12 ≠ final score 99',
    ])
  })

  it('flags both teams when nothing was parsed', () => {
    expect(validateBoxScore(null)).toEqual(['top team: no player rows', 'bottom team: no player rows'])
  })

  it('checks player rows even when the TOTAL row is missing', () => {
    const box = validBoxScore()
    delete box.team_top.totals
    expect(validateBoxScore(box)).toEqual([])
    box.team_top.players[0].fgm = 9
    expect(validateBoxScore(box)).toContain('top team Alpha: FGM 9 > FGA 8')
  })
})

describe('estimateCost', () => {
  it('prices input and output tokens per million for a known model', () => {
    const cost = estimateCost('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 })
    expect(cost).toBeCloseTo(0.6)
  })

  it('falls back to the most expensive rate for a model it does not know', () => {
    const usage = { input_tokens: 2000, output_tokens: 500 }
    expect(estimateCost('some-future-model', usage)).toBe(estimateCost('claude-opus-5-5', usage))
    expect(estimateCost('some-future-model', usage)).toBeCloseTo(0.018)
  })

  it('treats missing token counts as zero', () => {
    expect(estimateCost('claude-opus-5-5', {})).toBe(0)
  })
})

describe('parseBoxScore', () => {
  /** A stand-in for one Claude reply carrying `raw` as its JSON text. */
  const reply = (raw, usage = { input_tokens: 100, output_tokens: 20 }) => ({
    content: [{ type: 'text', text: JSON.stringify(raw) }],
    usage,
    stop_reason: 'end_turn',
  })

  /** A fake Claude client that returns the given replies in order. */
  function fakeClient(...replies) {
    const create = vi.fn()
    for (const r of replies) create.mockResolvedValueOnce(r)
    return { messages: { create } }
  }

  /** A raw box score with `count` failing checks, all on the top team's first player. */
  function rawWithIssues(count) {
    const raw = rawBoxScore()
    // Each of these breaks exactly one check without disturbing the column sums.
    if (count >= 1) raw.team_top.score = 99 // TOTAL PTS ≠ final score
    if (count >= 2) raw.team_bottom.score = 99
    return raw
  }

  const run = client => parseBoxScore({ client, base64: 'aW1hZ2U=', mediaType: 'image/png', model: 'test-model' })

  it('returns the first read when every check passes', async () => {
    const client = fakeClient(reply(rawBoxScore()))
    const result = await run(client)

    expect(client.messages.create).toHaveBeenCalledTimes(1)
    expect(result.attempts).toBe(1)
    expect(result.issues).toEqual([])
    expect(result.parsed.team_top.players[0].gamertag).toBe('Alpha')
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 20 })
    expect(result.model).toBe('test-model')
  })

  it('sends the image and the requested model to Claude', async () => {
    const client = fakeClient(reply(rawBoxScore()))
    await run(client)

    const request = client.messages.create.mock.calls[0][0]
    expect(request.model).toBe('test-model')
    expect(request.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'aW1hZ2U=' },
    })
  })

  it('asks for one re-read when checks fail, and uses it when it is clean', async () => {
    const client = fakeClient(
      reply(rawWithIssues(1), { input_tokens: 100, output_tokens: 20 }),
      reply(rawBoxScore(), { input_tokens: 150, output_tokens: 30 }),
    )
    const result = await run(client)

    expect(client.messages.create).toHaveBeenCalledTimes(2)
    expect(result.attempts).toBe(2)
    expect(result.issues).toEqual([])
    expect(result.parsed.team_top.score).toBe(16)
    expect(result.usage).toEqual({ input_tokens: 250, output_tokens: 50 })
  })

  it('tells Claude exactly which checks failed on the re-read', async () => {
    const client = fakeClient(reply(rawWithIssues(1)), reply(rawBoxScore()))
    await run(client)

    const { messages } = client.messages.create.mock.calls[1][0]
    expect(messages).toHaveLength(3)
    expect(messages[1].role).toBe('assistant')
    expect(messages[2].role).toBe('user')
    expect(messages[2].content).toContain('top team: TOTAL PTS 16 ≠ final score 99')
  })

  it('keeps the first read when the re-read is worse', async () => {
    const client = fakeClient(reply(rawWithIssues(1)), reply(rawWithIssues(2)))
    const result = await run(client)

    expect(result.attempts).toBe(2)
    expect(result.issues).toHaveLength(1)
    expect(result.parsed.team_bottom.score).toBe(12)
  })

  it('takes the re-read when it has the same number of issues', async () => {
    const first = rawWithIssues(1)
    const second = rawWithIssues(1)
    second.team_top.name = 'Second Read'
    const client = fakeClient(reply(first), reply(second))
    const result = await run(client)

    expect(result.issues).toHaveLength(1)
    expect(result.parsed.team_top.name).toBe('Second Read')
  })

  it('never re-reads more than once, even if the re-read still fails', async () => {
    const client = fakeClient(reply(rawWithIssues(2)), reply(rawWithIssues(1)))
    const result = await run(client)

    expect(client.messages.create).toHaveBeenCalledTimes(2)
    expect(result.issues).toHaveLength(1)
  })

  it('does not pay for a re-read when the image has no box score rows at all', async () => {
    const empty = {
      team_top: { name: '', score: 0, rows: [], total: '' },
      team_bottom: { name: '', score: 0, rows: [], total: '' },
    }
    const client = fakeClient(reply(empty))
    const result = await run(client)

    expect(client.messages.create).toHaveBeenCalledTimes(1)
    expect(result.attempts).toBe(1)
    expect(result.issues).toEqual(['top team: no player rows', 'bottom team: no player rows'])
  })

  it('fails clearly when Claude returns no text', async () => {
    const client = fakeClient({ content: [], usage: {}, stop_reason: 'refusal' })
    await expect(run(client)).rejects.toThrow('No text output (stop_reason: refusal)')
  })

  it('fails when Claude returns a malformed row', async () => {
    const raw = rawBoxScore()
    raw.team_top.rows[0] = 'Alpha | A | you'
    await expect(run(fakeClient(reply(raw)))).rejects.toThrow('Malformed row')
  })
})
