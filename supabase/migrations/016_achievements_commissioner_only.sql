-- player_achievements and game_mvp should only be managed by commissioners,
-- not any authenticated user. The "editors manage" policies used
-- auth.role() = 'authenticated' which is every signed-in user.

DROP POLICY IF EXISTS "editors manage achievements" ON player_achievements;
DROP POLICY IF EXISTS "editors manage game mvp" ON game_mvp;

CREATE POLICY "commissioners manage achievements" ON player_achievements
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

CREATE POLICY "commissioners manage game mvp" ON game_mvp
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
