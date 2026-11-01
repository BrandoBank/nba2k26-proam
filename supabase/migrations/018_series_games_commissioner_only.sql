-- series, games, and game_stats write access was open to all authenticated users.
-- Any signed-in player could directly create/modify series or game records via the API.
-- Restrict writes to commissioners only. Reads stay public (existing SELECT policies).
-- add-game.js uses the service-role key and bypasses RLS, so it is unaffected.

DROP POLICY IF EXISTS "editors full access series" ON series;
DROP POLICY IF EXISTS "editors full access games" ON games;
DROP POLICY IF EXISTS "editors full access game_stats" ON game_stats;

-- Series: commissioners only
CREATE POLICY "commissioners write series" ON series
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );

-- Games: commissioners only
CREATE POLICY "commissioners write games" ON games
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );

-- Game stats: commissioners only
CREATE POLICY "commissioners write game_stats" ON game_stats
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );
