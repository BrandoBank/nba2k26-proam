// Commissioner ingest: run box score screenshots through the same pipeline the
// site uses (duplicate check → AI read with TOTAL-row validation → gamertag
// snapping → roster-based sides) and, with --commit, save them as live games.
//
// Dry run (prints what would be saved):
//   ANTHROPIC_API_KEY=... node --env-file=.env scripts/ingest-series.mjs <series_id> g1.jpg g2.jpg ...
// Save:
//   ... scripts/ingest-series.mjs <series_id> --commit g1.jpg g2.jpg ...
// Files are taken in game order (first file = Game 1, unless the series already has games).
import fs from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin, imageHash, findDuplicate, snapGamertags, resolveSides, insertGame, cleanPlayers, statsFingerprint } from '../netlify/lib/shared.js'
import { parseBoxScore, PARSE_MODEL, estimateCost } from '../netlify/lib/parse.js'

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const [seriesId, ...files] = args.filter(a => a !== '--commit')
if (!seriesId || !files.length) { console.error('usage: ingest-series.mjs <series_id> [--commit] files...'); process.exit(1) }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const { data: existing } = await supabaseAdmin.from('games').select('game_number').eq('series_id', seriesId)
let nextGame = Math.max(0, ...(existing || []).map(g => g.game_number)) + 1
const fmt = p => `${p.gamertag} ${p.pts}/${p.reb}/${p.ast}/${p.stl}/${p.blk}/${p.fouls}/${p.tov} ${p.fgm}-${p.fga} ${p.tpm}-${p.tpa} ${p.ftm}-${p.fta} ${p.grade ?? ''}`
let total = 0

for (const file of files) {
  const game_number = nextGame++
  const base64 = fs.readFileSync(file).toString('base64')
  const mediaType = file.endsWith('.png') ? 'image/png' : 'image/jpeg'
  const image_hash = imageHash(base64)
  const dupImg = await findDuplicate({ image_hash })
  if (dupImg) { console.log(`G${game_number} SKIP ${file}: ${dupImg.message}`); continue }

  const r = await parseBoxScore({ client, base64, mediaType })
  total += estimateCost(PARSE_MODEL, r.usage)
  const { team_top: top, team_bottom: bottom } = r.parsed
  const { corrections, newPlayers } = await snapGamertags([top, bottom])
  const side = await resolveSides(seriesId, top, bottom)
  const [ours, opp] = side.ours === 'top' ? [top, bottom] : [bottom, top]
  const all = [...top.players, ...bottom.players]
  const you = all.find(p => p.marker === 'you'), mu = all.find(p => p.marker === 'matchup')
  const marked_matchup = you && mu && (top.players.includes(you) !== top.players.includes(mu)) ? { defender: you.gamertag, offensive: mu.gamertag } : null

  const game = {
    series_id: seriesId, game_number,
    our_score: ours.score, opp_score: opp.score, our_result: ours.score > opp.score ? 'W' : 'L',
    our_players: cleanPlayers(ours.players), opp_players: cleanPlayers(opp.players),
    screenshot_hash: image_hash, marked_matchup, submitted_by_gamertag: 'BrandoBank',
  }
  console.log(`\nG${game_number} ${file}  ${game.our_result} ${game.our_score}-${game.opp_score}  (tries ${r.attempts}, sides by ${side.reason})`)
  console.log(`  checks: ${r.issues.length ? r.issues.join('; ') : 'all pass'}  new: ${newPlayers.join(',') || '-'}  fixes: ${corrections.map(c => c.from + '→' + c.to).join(',') || '-'}  matchup: ${marked_matchup ? marked_matchup.defender + '→' + marked_matchup.offensive : '-'}`)
  console.log(`  ours: ${game.our_players.map(fmt).join(' | ')}`)
  console.log(`  opp:  ${game.opp_players.map(fmt).join(' | ')}`)

  if (commit) {
    if (r.issues.length) { console.log('  NOT SAVED — checks failed, enter this one by hand'); continue }
    const dup = await findDuplicate({ series_id: seriesId, game_number, fingerprint: statsFingerprint(game) })
    if (dup) { console.log(`  NOT SAVED — ${dup.message}`); continue }
    const id = await insertGame(game)
    console.log(`  saved game ${id}`)
  }
}
console.log(`\n${commit ? 'Committed' : 'Dry run'} — model ${PARSE_MODEL}, est. cost $${total.toFixed(3)}`)
