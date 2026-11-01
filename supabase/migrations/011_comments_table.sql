-- Feed comments table (documents schema added via Supabase dashboard)
-- Run this if starting from scratch or if comments table is missing policies.

CREATE TABLE IF NOT EXISTS comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gamertag    text NOT NULL,
  body        text NOT NULL CHECK (char_length(body) <= 300),
  quote_text  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read feed posts
CREATE POLICY IF NOT EXISTS "public read comments" ON comments
  FOR SELECT USING (true);

-- Signed-in users with a gamertag can post
CREATE POLICY IF NOT EXISTS "authenticated insert comments" ON comments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Users can delete their own posts; BrandoBank can delete any
CREATE POLICY IF NOT EXISTS "delete own or commissioner" ON comments
  FOR DELETE USING (
    auth.role() = 'authenticated'
  );

GRANT SELECT, INSERT, DELETE ON comments TO anon, authenticated;
