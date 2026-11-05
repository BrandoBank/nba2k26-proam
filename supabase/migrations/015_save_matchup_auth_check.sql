-- Add auth check to save_matchup function.
-- Previously SECURITY DEFINER with no body validation — any user (including anon)
-- could upsert any player's matchup by passing arbitrary player IDs.
-- Now verifies the caller owns the defender player row OR is a commissioner.

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
DECLARE
  v_caller_uid  uuid := auth.uid();
  v_is_owner    boolean;
  v_is_commissioner boolean;
BEGIN
  -- Verify caller owns the defender row or is a commissioner
  SELECT EXISTS (
    SELECT 1 FROM players
    WHERE id = p_defender_player_id
      AND user_id = v_caller_uid
  ) INTO v_is_owner;

  SELECT EXISTS (
    SELECT 1 FROM players
    WHERE user_id = v_caller_uid
      AND gamertag = 'BrandoBank'
  ) INTO v_is_commissioner;

  IF NOT (v_is_owner OR v_is_commissioner) THEN
    RAISE EXCEPTION 'Not authorized to submit matchup for this player';
  END IF;

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

GRANT EXECUTE ON FUNCTION save_matchup TO authenticated;
REVOKE EXECUTE ON FUNCTION save_matchup FROM anon;
