-- SECURITY DEFINER function for upserting matchups.
-- Runs as the postgres/owner role regardless of calling role,
-- bypassing all GRANT and RLS checks on game_matchups.
CREATE OR REPLACE FUNCTION save_matchup(
  p_game_id              uuid,
  p_series_id            uuid,
  p_defender_player_id   uuid,
  p_offensive_player_id  uuid,
  p_quarter_switches     jsonb DEFAULT '[]',
  p_submitted_by_gamertag text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO game_matchups (
    game_id, series_id, defender_player_id, offensive_player_id,
    quarter_switches, submitted_by_gamertag
  )
  VALUES (
    p_game_id, p_series_id, p_defender_player_id, p_offensive_player_id,
    p_quarter_switches, p_submitted_by_gamertag
  )
  ON CONFLICT (game_id, defender_player_id)
  DO UPDATE SET
    offensive_player_id    = EXCLUDED.offensive_player_id,
    quarter_switches       = EXCLUDED.quarter_switches,
    submitted_by_gamertag  = EXCLUDED.submitted_by_gamertag;
END;
$$;

-- Allow anyone to call this function (the function itself enforces safety)
GRANT EXECUTE ON FUNCTION save_matchup TO anon, authenticated;
