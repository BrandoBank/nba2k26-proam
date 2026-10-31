-- Add 'unfinished' status to series_status enum
-- Used when a new series starts while one is in_progress — it becomes unfinished
-- (rankings preserved; games can still be added retroactively)
ALTER TYPE series_status ADD VALUE IF NOT EXISTS 'unfinished';

-- Grant INSERT/UPDATE on game_matchups to authenticated and anon roles
-- The table has RLS enabled but was missing GRANT statements entirely,
-- causing "permission denied" for client-side upserts even with a valid RLS policy.
GRANT SELECT, INSERT, UPDATE ON game_matchups TO authenticated, anon;
