-- api_usage: logging table for Anthropic API calls (token counts + estimated cost).
-- Referenced by parse-screenshot.js but never created — inserts were silently failing.

CREATE TABLE IF NOT EXISTS api_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  tokens_input  integer NOT NULL DEFAULT 0,
  tokens_output integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  series_id     uuid REFERENCES series(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Only commissioners can read usage logs
CREATE POLICY "commissioners read api_usage" ON api_usage
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.user_id = auth.uid()
        AND players.gamertag = 'BrandoBank'
    )
  );

-- Service role (used by the function) bypasses RLS for inserts — no policy needed.
-- Anon and regular authenticated users cannot read or write this table.
