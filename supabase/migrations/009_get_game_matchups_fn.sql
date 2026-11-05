-- SECURITY DEFINER function to read matchups for a single game.
-- LogMatchup uses this to pre-fill existing matchup data on re-entry.
CREATE OR REPLACE FUNCTION get_game_matchups(p_game_id uuid)
RETURNS TABLE (
  defender_player_id     uuid,
  offensive_player_id    uuid,
  quarter_switches       jsonb,
  submitted_by_gamertag  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT defender_player_id, offensive_player_id, quarter_switches, submitted_by_gamertag
  FROM game_matchups
  WHERE game_id = p_game_id;
$$;

GRANT EXECUTE ON FUNCTION get_game_matchups(uuid) TO anon, authenticated;
