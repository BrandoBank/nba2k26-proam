-- Restrict player row updates to the owning user.
-- Previously "editors full access players" allowed any authenticated user
-- to update any player's display_name or other fields. Replace the
-- overly-broad policy with per-operation policies.

-- Drop the catch-all and re-add as separate SELECT / INSERT / UPDATE / DELETE.
DROP POLICY IF EXISTS "editors full access players" ON players;

-- Any authenticated user can read (already covered by "public read players" for SELECT,
-- but keep this for completeness when the public policy is present).
CREATE POLICY "auth users insert players" ON players
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Users can only update their own row. Commissioners (identified by gamertag) can update any row.
-- We identify commissioners by checking the caller's own player row gamertag.
CREATE POLICY "players self update" ON players
  FOR UPDATE TO authenticated
  USING (
    -- Own row
    user_id = auth.uid()
    OR
    -- Commissioner override: caller's player row has gamertag 'BrandoBank'
    EXISTS (
      SELECT 1 FROM players p2
      WHERE p2.user_id = auth.uid()
        AND p2.gamertag = 'BrandoBank'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM players p2
      WHERE p2.user_id = auth.uid()
        AND p2.gamertag = 'BrandoBank'
    )
  );

-- Only commissioners can delete player rows.
CREATE POLICY "commissioners delete players" ON players
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players p2
      WHERE p2.user_id = auth.uid()
        AND p2.gamertag = 'BrandoBank'
    )
  );
