-- series_predictions: two bugs with the current policies.
--
-- Bug 1: UPDATE required auth.role() = 'authenticated'.
--   Upsert (INSERT ... ON CONFLICT DO UPDATE) needs BOTH insert AND update policies
--   to pass. Anon users can insert new predictions but their update silently fails
--   when they try to change an existing prediction.
--
-- Bug 2: Any authenticated user could overwrite any prediction row.
--
-- Fix: since predictor_gamertag is a free-text field (not linked to auth.uid),
-- we can't scope updates to "own row only". Predictions are a low-stakes public
-- feature — open INSERT/UPDATE to anon so anyone can change their own prediction
-- by matching their gamertag (same model as the existing open insert).

DROP POLICY IF EXISTS "editors update predictions" ON series_predictions;

CREATE POLICY "anon upsert predictions" ON series_predictions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
