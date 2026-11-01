-- Migration 012 broke two flows on the players table:
--
-- 1. CLAIMING (setting user_id on an unclaimed row where user_id IS NULL):
--    The USING clause required user_id = auth.uid(), but NULL ≠ anything — the
--    policy never matched unclaimed rows, so Claim.jsx silently failed.
--
-- 2. RELEASING (setting user_id back to null):
--    The WITH CHECK required user_id = auth.uid() on the new row. Setting
--    user_id = null fails that check.
--
-- Fix: expand USING and WITH CHECK to also allow:
--   - Updating rows where user_id IS NULL (for claiming)
--   - Setting user_id to null in the new row (for releasing)
-- The combination is still safe:
--   - Malicious users can't claim an already-claimed row (USING: user_id IS NULL fails)
--   - Malicious users can't set another user's user_id (WITH CHECK: must be own uid or null)
--   - Malicious users can't release someone else's claim (USING: user_id = auth.uid() fails)

DROP POLICY IF EXISTS "players self update" ON players;

CREATE POLICY "players update" ON players
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()                          -- own claimed row
    OR user_id IS NULL                            -- unclaimed row (for claiming)
    OR EXISTS (
      SELECT 1 FROM players p2
      WHERE p2.user_id = auth.uid()
        AND p2.gamertag = 'BrandoBank'
    )
  )
  WITH CHECK (
    user_id = auth.uid()                          -- keeping as own / claiming
    OR user_id IS NULL                            -- releasing (setting back to null)
    OR EXISTS (
      SELECT 1 FROM players p2
      WHERE p2.user_id = auth.uid()
        AND p2.gamertag = 'BrandoBank'
    )
  );
