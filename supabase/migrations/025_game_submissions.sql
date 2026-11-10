-- Contributor game submissions + duplicate-screenshot protection.
--
-- Any signed-in player with a claimed profile can submit a box score screenshot
-- for an active series. Submissions sit in a pending queue and never touch the
-- live games/game_stats tables until the commissioner approves them.
--
-- Duplicate protection:
--   * games.screenshot_hash           — SHA-256 of the image bytes for every live game
--   * game_submissions.image_hash     — unique among non-rejected submissions
--   * game_submissions.stats_fingerprint — catches the same box score re-screenshotted
--     (different bytes, identical stats)
--
-- All writes go through Netlify functions using the service role key, so no
-- INSERT/UPDATE/DELETE policies are defined here.

ALTER TABLE games ADD COLUMN IF NOT EXISTS screenshot_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS games_screenshot_hash_key
  ON games (screenshot_hash) WHERE screenshot_hash IS NOT NULL;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS game_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id          uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  game_number        int  NOT NULL CHECK (game_number BETWEEN 1 AND 7),
  submitted_by       uuid NOT NULL REFERENCES players(id),
  submitted_by_user  uuid NOT NULL,
  image_hash         text NOT NULL,
  image_path         text NOT NULL,
  stats_fingerprint  text NOT NULL,
  payload            jsonb NOT NULL,
  status             submission_status NOT NULL DEFAULT 'pending',
  review_note        text,
  reviewed_at        timestamptz,
  approved_game_id   uuid REFERENCES games(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- The same picture can only be in play once. A rejected submission frees the
-- image so a corrected re-submit is possible.
CREATE UNIQUE INDEX IF NOT EXISTS game_submissions_image_hash_live
  ON game_submissions (image_hash) WHERE status <> 'rejected';

CREATE INDEX IF NOT EXISTS game_submissions_series_status
  ON game_submissions (series_id, status);

ALTER TABLE game_submissions ENABLE ROW LEVEL SECURITY;

-- Submitters can see their own submissions (status tracking).
CREATE POLICY "submitters read own submissions" ON game_submissions
  FOR SELECT TO authenticated
  USING (submitted_by_user = auth.uid());

-- Commissioner sees the whole queue.
CREATE POLICY "commissioners read submissions" ON game_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );

-- Private bucket for submitted screenshots. Only the service role reads/writes;
-- the review function hands the commissioner short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('box-scores', 'box-scores', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;
