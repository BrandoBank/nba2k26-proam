-- Grade-outs (2026-11-13).
--
-- A player "grades out" when 2K kicks them for poor play (teammate grade hits F).
-- Their AI keeps playing, so the box score after that point isn't theirs.
-- League rule: a grade-out is an automatic G Tier for that series.

ALTER TABLE game_stats ADD COLUMN IF NOT EXISTS graded_out boolean NOT NULL DEFAULT false;

-- Pending submissions carry it inside payload jsonb; nothing to change there.

-- Backfill: RomeHearts graded out in 2K27 Series 11 (one game, 51–34).
UPDATE game_stats gs
SET graded_out = true
FROM players p
WHERE gs.player_id = p.id
  AND p.gamertag = 'RomeHearts'
  AND gs.series_id = 'f681df8b-99b3-431b-87d0-2a26e421e18c';
