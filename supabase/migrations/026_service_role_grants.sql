-- The service role (used only by Netlify functions, never shipped to browsers)
-- was missing table privileges on several tables created through the SQL
-- editor: comments, game_matchups, game_mvp, player_achievements,
-- series_awards, series_predictions, stat_edits. Server-side writes to them
-- failed with "permission denied" — e.g. matchups recorded during add-game
-- and approvals were silently dropped.
--
-- Supabase's default is full access for service_role (it bypasses RLS anyway);
-- restore that, and make it the default for tables created later.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
