-- stat_edits is an audit log table. No feature currently writes to it,
-- but "editors insert stat edits" allowed any authenticated user to append rows.
-- Restrict to commissioners so the audit log can't be polluted.

DROP POLICY IF EXISTS "editors insert stat edits" ON stat_edits;

CREATE POLICY "commissioners insert stat edits" ON stat_edits
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );
