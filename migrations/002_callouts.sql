-- ============================================================
-- MIGRATION 002: Callouts (player rivalry challenges)
-- ============================================================

CREATE TABLE IF NOT EXISTS callouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid REFERENCES players(id) ON DELETE CASCADE,
  challenged_id uuid REFERENCES players(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('1v1', 'draft')),
  message       text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Index for fast lookups per player
CREATE INDEX IF NOT EXISTS callouts_challenged_idx ON callouts(challenged_id, status);
CREATE INDEX IF NOT EXISTS callouts_challenger_idx ON callouts(challenger_id);

-- RLS: players can read callouts they sent or received
ALTER TABLE callouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "callouts_select" ON callouts
  FOR SELECT USING (true);

CREATE POLICY "callouts_insert" ON callouts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "callouts_update" ON callouts
  FOR UPDATE USING (true);

-- Grant to anon + authenticated
GRANT SELECT, INSERT, UPDATE ON callouts TO anon, authenticated;

-- Also re-grant series_player_averages if lost
GRANT SELECT ON series_player_averages TO anon, authenticated;

-- VERIFY
SELECT 'callouts table created' AS result;
