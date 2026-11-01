-- Migration 012 replaced "editors full access players" with separate per-operation
-- policies. The INSERT policy it created allows any authenticated user to add
-- player rows with WITH CHECK (true). Any signed-in user could spam the roster.
-- Restrict INSERT to commissioners only. import-history.js (the only other caller)
-- already uses supabaseAdmin for all other writes; its player insert will be
-- switched to supabaseAdmin as well, bypassing RLS.

DROP POLICY IF EXISTS "auth users insert players" ON players;

CREATE POLICY "commissioners insert players" ON players
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players p2
      WHERE p2.user_id = auth.uid()
        AND p2.gamertag = 'BrandoBank'
    )
  );
