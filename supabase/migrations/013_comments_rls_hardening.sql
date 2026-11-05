-- Harden comments RLS:
-- 1. INSERT must match the session user's actual gamertag (prevents impersonation)
-- 2. DELETE restricted to own post or commissioner

DROP POLICY IF EXISTS "authenticated insert comments" ON comments;
DROP POLICY IF EXISTS "delete own or commissioner" ON comments;

-- Insert: gamertag must match the player row linked to this auth user
CREATE POLICY "insert own gamertag only" ON comments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = comments.gamertag
    )
  );

-- Delete: own post (by matching gamertag to session user's player) OR commissioner
CREATE POLICY "delete own or commissioner" ON comments
  FOR DELETE TO authenticated
  USING (
    -- Own comment
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = comments.gamertag
    )
    OR
    -- Commissioner override
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );
