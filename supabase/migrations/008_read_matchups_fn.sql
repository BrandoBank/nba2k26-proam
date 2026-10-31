-- SECURITY DEFINER function to read matchups for a series.
-- Bypasses GRANT/RLS on game_matchups for the anon client.
CREATE OR REPLACE FUNCTION get_series_matchups(p_series_id uuid)
RETURNS TABLE (
  game_id              uuid,
  defender_player_id   uuid,
  offensive_player_id  uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT game_id, defender_player_id, offensive_player_id
  FROM game_matchups
  WHERE series_id = p_series_id;
$$;

GRANT EXECUTE ON FUNCTION get_series_matchups(uuid) TO anon, authenticated;

-- Also read per-game pts needed for defensive delta computation
CREATE OR REPLACE FUNCTION get_series_game_pts(p_series_id uuid)
RETURNS TABLE (
  game_id    uuid,
  player_id  uuid,
  pts        int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT game_id, player_id, pts
  FROM game_stats
  WHERE series_id = p_series_id;
$$;

GRANT EXECUTE ON FUNCTION get_series_game_pts(uuid) TO anon, authenticated;
