-- Site-wide permissions audit (2026-11-10).
--
-- Table GRANTs were missing for many tables, so features failed regardless of
-- RLS policy: visitors couldn't read awards/achievements/predictions/stat
-- edits/clutch stats; signed-in players couldn't read matchups or MVPs, make
-- predictions or delete their own comments; the commissioner couldn't update
-- series (Publish) or edit games/stats from the browser.
--
-- The audit also found policies that let any signed-in user bypass the
-- commissioner/review gates. Those are dropped first, then grants are restored
-- so RLS (not missing grants) decides access.

-- ── 1. Close policy holes ───────────────────────────────────────────────────
-- WITH CHECK (true) inserts: any signed-in user could write games/stats/series/
-- rankings/players directly, skipping the review queue.
DROP POLICY IF EXISTS "auth insert games" ON games;
DROP POLICY IF EXISTS "auth insert game_stats" ON game_stats;
DROP POLICY IF EXISTS "auth insert series" ON series;
DROP POLICY IF EXISTS "auth insert series_rankings" ON series_rankings;
DROP POLICY IF EXISTS "auth insert players" ON players;

-- Any signed-in user could edit any unclaimed player (incl. gamertag).
-- Claim / release / own display name keep their dedicated policies.
DROP POLICY IF EXISTS "players update" ON players;
DROP POLICY IF EXISTS "commissioners update players" ON players;
CREATE POLICY "commissioners update players" ON players
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM players p2 WHERE p2.user_id = auth.uid() AND p2.gamertag = 'BrandoBank'))
  WITH CHECK (EXISTS (SELECT 1 FROM players p2 WHERE p2.user_id = auth.uid() AND p2.gamertag = 'BrandoBank'));

-- Any signed-in user could delete any comment; "delete own or commissioner" stays.
DROP POLICY IF EXISTS "admin_delete_comments" ON comments;
-- Anyone (even logged out) could post as any gamertag; "insert own gamertag only" stays.
DROP POLICY IF EXISTS "anon insert comments" ON comments;

-- ── 2. Restore grants (RLS policies decide what each role may actually do) ──
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
REVOKE SELECT ON api_usage, game_submissions FROM anon;

GRANT INSERT, UPDATE, DELETE ON
  callouts, comments, game_matchups, game_mvp, game_stats, games,
  player_achievements, series, series_awards, series_predictions,
  series_rankings, stat_edits
TO authenticated;

-- Players: insert/delete are commissioner-only by policy; browser updates may
-- only touch the claim and display name (no gamertag changes).
GRANT INSERT, DELETE ON players TO authenticated;
REVOKE UPDATE ON players FROM authenticated;
GRANT UPDATE (user_id, display_name) ON players TO authenticated;

-- Submissions and cost logs are written only by Netlify functions (service role).
REVOKE INSERT, UPDATE, DELETE ON game_submissions, api_usage FROM authenticated;

-- Predictions work without signing in (existing policies allow it).
GRANT INSERT, UPDATE ON series_predictions TO anon;
-- Posting comments requires sign-in.
REVOKE INSERT, UPDATE, DELETE ON comments FROM anon;
