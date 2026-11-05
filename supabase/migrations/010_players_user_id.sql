-- Adds user_id column to players so accounts can be linked to player profiles.
-- This column was added directly via the Supabase dashboard; this migration
-- documents it so the schema is reproducible.
ALTER TABLE players ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- One account per player, one player per account
CREATE UNIQUE INDEX IF NOT EXISTS players_user_id_unique ON players (user_id) WHERE user_id IS NOT NULL;

-- Allow authenticated users to update their own unclaimed row (for claiming)
-- The existing "editors full access players" policy already covers this since
-- auth.role() = 'authenticated' for any signed-in user.
-- No additional policy needed.
