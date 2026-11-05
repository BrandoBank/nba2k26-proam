-- series_rankings and series_awards write access was open to all authenticated users.
-- Restrict inserts/updates/deletes to commissioners only.

DROP POLICY IF EXISTS "editors full access rankings" ON series_rankings;
DROP POLICY IF EXISTS "editors full access awards" ON series_awards;

-- Rankings: public SELECT already exists. Add commissioner-only write.
CREATE POLICY "commissioners write rankings" ON series_rankings
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

-- Awards: same pattern
CREATE POLICY "commissioners write awards" ON series_awards
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
