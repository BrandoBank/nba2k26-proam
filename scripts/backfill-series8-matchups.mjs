// One-off: re-insert the arrow-marker matchups for 2K27 Series 8 that were
// dropped before migration 026 granted service_role access to game_matchups.
// Run: node --env-file=.env scripts/backfill-series7-matchups.mjs
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const SERIES = '46ecbd03-fcf4-4dae-ab5d-41ed236befad'
// From the green YOU / red YOUR MATCHUP arrows on each screenshot
const MATCHUPS = { 1: 'TTVxGB_2x', 2: 'RomeHearts', 3: 'RomeHearts', 4: 'JuliusIsBrown', 5: 'TTVxGB_2x' }

const { data: games } = await sb.from('games').select('id, game_number').eq('series_id', SERIES)
const { data: players } = await sb.from('players').select('id, gamertag')
const id = tag => players.find(p => p.gamertag === tag)?.id
const brando = id('BrandoBank')

for (const g of games.sort((a, b) => a.game_number - b.game_number)) {
  const off = id(MATCHUPS[g.game_number])
  const { error } = await sb.from('game_matchups').upsert(
    { game_id: g.id, series_id: SERIES, defender_player_id: brando, offensive_player_id: off, submitted_by_gamertag: 'BrandoBank' },
    { onConflict: 'game_id,defender_player_id' },
  )
  console.log(`G${g.game_number} BrandoBank → ${MATCHUPS[g.game_number]}:`, error ? error.message : 'saved')
}
