-- Harden callouts RLS.
-- Previous policies allowed anyone to INSERT as any challenger_id,
-- and anyone to UPDATE any callout's status.

DROP POLICY IF EXISTS "callouts_insert" ON callouts;
DROP POLICY IF EXISTS "callouts_update" ON callouts;

-- INSERT: challenger_id must be the session user's own player row
CREATE POLICY "callouts_insert" ON callouts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = callouts.challenger_id
        AND players.user_id = auth.uid()
    )
  );

-- UPDATE: only the challenged player can accept/decline their own callout,
-- or the challenger can cancel (set status = 'expired') their own callout.
-- Commissioners can update any callout.
CREATE POLICY "callouts_update" ON callouts
  FOR UPDATE TO authenticated
  USING (
    -- Challenged player responding
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = callouts.challenged_id
        AND players.user_id = auth.uid()
    )
    OR
    -- Challenger cancelling their own
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = callouts.challenger_id
        AND players.user_id = auth.uid()
    )
    OR
    -- Commissioner override
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );
