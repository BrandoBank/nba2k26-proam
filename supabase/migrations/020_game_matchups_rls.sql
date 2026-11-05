-- game_matchups: "editors full access matchups" allowed any authenticated user
-- to directly write/delete any player's matchup row via the Supabase REST API.
-- The save_matchup RPC is SECURITY DEFINER (bypasses RLS) and already has an
-- ownership check (migration 015), but direct API calls were unguarded.
--
-- New policy: player who owns the defender row can INSERT/UPDATE their matchup;
-- commissioner can do anything.

DROP POLICY IF EXISTS "editors full access matchups" ON game_matchups;
DROP POLICY IF EXISTS "anon insert matchups" ON game_matchups;
DROP POLICY IF EXISTS "anon update own matchup" ON game_matchups;

-- INSERT: caller owns the defender player row
CREATE POLICY "matchups insert own" ON game_matchups
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = game_matchups.defender_player_id
        AND players.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );

-- UPDATE: same — own defender row or commissioner
CREATE POLICY "matchups update own" ON game_matchups
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = game_matchups.defender_player_id
        AND players.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );

-- DELETE: commissioner only
CREATE POLICY "matchups delete commissioner" ON game_matchups
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );
