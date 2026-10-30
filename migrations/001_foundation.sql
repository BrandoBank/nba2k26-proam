-- ============================================================
-- MIGRATION 001: Data Foundation
-- ============================================================
-- 1. Backfill played_at from created_at on all existing games
-- 2. Set played_at DEFAULT now() so future inserts auto-timestamp
-- 3. Backfill series started_at / ended_at from game timestamps
-- 4. Replace per-game series_player_averages rows with true
--    per-series aggregates (ppg/rpg/apg/spg/bpg over all games
--    in that series, plus wins/losses)
-- 5. Trigger: auto-refresh a player's series row after any
--    game_stats insert or update
-- ============================================================


-- ------------------------------------------------------------
-- 1. Backfill played_at using created_at
-- ------------------------------------------------------------
UPDATE games
SET played_at = created_at
WHERE played_at IS NULL;

-- Set DEFAULT so every future game insert gets a timestamp
ALTER TABLE games
  ALTER COLUMN played_at SET DEFAULT now();


-- ------------------------------------------------------------
-- 2. Backfill series started_at / ended_at
-- ------------------------------------------------------------
UPDATE series s
SET
  started_at = sub.first_game,
  ended_at   = sub.last_game
FROM (
  SELECT
    series_id,
    MIN(played_at) AS first_game,
    MAX(played_at) AS last_game
  FROM games
  GROUP BY series_id
) sub
WHERE s.id = sub.series_id
  AND (s.started_at IS NULL OR s.ended_at IS NULL);


-- ------------------------------------------------------------
-- 3. Rebuild series_player_averages as true per-series stats
--
--    The table currently has one row per game per player (gp=1).
--    We replace that with one row per series per player that
--    aggregates all games they appeared in for that series.
-- ------------------------------------------------------------

-- Drop the game_id column (series averages don't belong to one game)
ALTER TABLE series_player_averages DROP COLUMN IF EXISTS game_id;

-- Add unique constraint so ON CONFLICT works and duplicates can't happen
ALTER TABLE series_player_averages
  DROP CONSTRAINT IF EXISTS spa_series_player_unique;
ALTER TABLE series_player_averages
  ADD CONSTRAINT spa_series_player_unique UNIQUE (series_id, player_id);

-- Remove the stale per-game rows
TRUNCATE series_player_averages;

-- Insert true aggregates for every (series, player) pair
INSERT INTO series_player_averages (
  series_id,
  player_id,
  gamertag,
  display_name,
  side,
  gp,
  ppg,  rpg,  apg,  spg,  bpg,  tovpg,
  total_fgm, total_fga,
  total_tpm, total_tpa,
  total_ftm, total_fta,
  fg_pct, three_pct,
  best_pts
)
SELECT
  g.series_id,
  gs.player_id,
  p.gamertag,
  p.display_name,
  gs.side,
  COUNT(*)                                                AS gp,
  ROUND(AVG(gs.pts)::numeric,  1)                        AS ppg,
  ROUND(AVG(gs.reb)::numeric,  1)                        AS rpg,
  ROUND(AVG(gs.ast)::numeric,  1)                        AS apg,
  ROUND(AVG(gs.stl)::numeric,  1)                        AS spg,
  ROUND(AVG(gs.blk)::numeric,  1)                        AS bpg,
  ROUND(AVG(gs.tov)::numeric,  1)                        AS tovpg,
  SUM(gs.fgm)                                            AS total_fgm,
  SUM(gs.fga)                                            AS total_fga,
  SUM(gs.tpm)                                            AS total_tpm,
  SUM(gs.tpa)                                            AS total_tpa,
  SUM(gs.ftm)                                            AS total_ftm,
  SUM(gs.fta)                                            AS total_fta,
  CASE WHEN SUM(gs.fga) > 0
    THEN ROUND((SUM(gs.fgm)::numeric / SUM(gs.fga)) * 100, 1)
    ELSE NULL END                                         AS fg_pct,
  CASE WHEN SUM(gs.tpa) > 0
    THEN ROUND((SUM(gs.tpm)::numeric / SUM(gs.tpa)) * 100, 1)
    ELSE NULL END                                         AS three_pct,
  MAX(gs.pts)                                            AS best_pts
FROM game_stats gs
JOIN games     g  ON g.id  = gs.game_id
JOIN players   p  ON p.id  = gs.player_id
GROUP BY g.series_id, gs.player_id, p.gamertag, p.display_name, gs.side;


-- ------------------------------------------------------------
-- 4. Function: refresh one player's row for one series
--    Called by the trigger below; also safe to call manually.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_series_player_avg(
  p_series_id UUID,
  p_player_id UUID
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_side        text;
  v_gp          int;
  v_ppg         numeric;
  v_rpg         numeric;
  v_apg         numeric;
  v_spg         numeric;
  v_bpg         numeric;
  v_tovpg       numeric;
  v_fgm         int;
  v_fga         int;
  v_tpm         int;
  v_tpa         int;
  v_ftm         int;
  v_fta         int;
  v_fg_pct      numeric;
  v_three_pct   numeric;
  v_best_pts    int;
  v_gamertag    text;
  v_display     text;
BEGIN
  SELECT
    p.gamertag, p.display_name
  INTO v_gamertag, v_display
  FROM players p WHERE p.id = p_player_id;

  SELECT
    gs.side,
    COUNT(*),
    ROUND(AVG(gs.pts)::numeric, 1),
    ROUND(AVG(gs.reb)::numeric, 1),
    ROUND(AVG(gs.ast)::numeric, 1),
    ROUND(AVG(gs.stl)::numeric, 1),
    ROUND(AVG(gs.blk)::numeric, 1),
    ROUND(AVG(gs.tov)::numeric, 1),
    SUM(gs.fgm), SUM(gs.fga),
    SUM(gs.tpm), SUM(gs.tpa),
    SUM(gs.ftm), SUM(gs.fta),
    CASE WHEN SUM(gs.fga) > 0
      THEN ROUND((SUM(gs.fgm)::numeric / SUM(gs.fga)) * 100, 1) ELSE NULL END,
    CASE WHEN SUM(gs.tpa) > 0
      THEN ROUND((SUM(gs.tpm)::numeric / SUM(gs.tpa)) * 100, 1) ELSE NULL END,
    MAX(gs.pts)
  INTO
    v_side, v_gp, v_ppg, v_rpg, v_apg, v_spg, v_bpg, v_tovpg,
    v_fgm, v_fga, v_tpm, v_tpa, v_ftm, v_fta,
    v_fg_pct, v_three_pct, v_best_pts
  FROM game_stats gs
  JOIN games g ON g.id = gs.game_id
  WHERE g.series_id = p_series_id
    AND gs.player_id = p_player_id
  GROUP BY gs.side;

  IF v_gp IS NULL THEN
    -- No stats found; remove any stale row
    DELETE FROM series_player_averages
    WHERE series_id = p_series_id AND player_id = p_player_id;
    RETURN;
  END IF;

  INSERT INTO series_player_averages (
    series_id, player_id, gamertag, display_name, side,
    gp, ppg, rpg, apg, spg, bpg, tovpg,
    total_fgm, total_fga, total_tpm, total_tpa, total_ftm, total_fta,
    fg_pct, three_pct, best_pts
  )
  VALUES (
    p_series_id, p_player_id, v_gamertag, v_display, v_side,
    v_gp, v_ppg, v_rpg, v_apg, v_spg, v_bpg, v_tovpg,
    v_fgm, v_fga, v_tpm, v_tpa, v_ftm, v_fta,
    v_fg_pct, v_three_pct, v_best_pts
  )
  ON CONFLICT (series_id, player_id)
  DO UPDATE SET
    gamertag    = EXCLUDED.gamertag,
    display_name = EXCLUDED.display_name,
    side        = EXCLUDED.side,
    gp          = EXCLUDED.gp,
    ppg         = EXCLUDED.ppg,
    rpg         = EXCLUDED.rpg,
    apg         = EXCLUDED.apg,
    spg         = EXCLUDED.spg,
    bpg         = EXCLUDED.bpg,
    tovpg       = EXCLUDED.tovpg,
    total_fgm   = EXCLUDED.total_fgm,
    total_fga   = EXCLUDED.total_fga,
    total_tpm   = EXCLUDED.total_tpm,
    total_tpa   = EXCLUDED.total_tpa,
    total_ftm   = EXCLUDED.total_ftm,
    total_fta   = EXCLUDED.total_fta,
    fg_pct      = EXCLUDED.fg_pct,
    three_pct   = EXCLUDED.three_pct,
    best_pts    = EXCLUDED.best_pts;
END;
$$;


-- ------------------------------------------------------------
-- 5. Trigger: auto-refresh on game_stats insert/update/delete
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_refresh_series_player_avg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_series_id UUID;
  v_player_id UUID;
BEGIN
  -- Resolve the series_id from the game row
  IF TG_OP = 'DELETE' THEN
    SELECT series_id INTO v_series_id FROM games WHERE id = OLD.game_id;
    v_player_id := OLD.player_id;
  ELSE
    SELECT series_id INTO v_series_id FROM games WHERE id = NEW.game_id;
    v_player_id := NEW.player_id;
  END IF;

  IF v_series_id IS NOT NULL THEN
    PERFORM refresh_series_player_avg(v_series_id, v_player_id);
  END IF;

  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_game_stats_refresh_spa ON game_stats;

CREATE TRIGGER trg_game_stats_refresh_spa
AFTER INSERT OR UPDATE OR DELETE ON game_stats
FOR EACH ROW
EXECUTE FUNCTION trg_refresh_series_player_avg();


-- ------------------------------------------------------------
-- VERIFY
-- ------------------------------------------------------------
-- After running, check counts:
--   SELECT COUNT(*) FROM series_player_averages;     -- should be ~120–150 (players × series)
--   SELECT COUNT(*) FROM games WHERE played_at IS NOT NULL;  -- should be 42
--   SELECT started_at, ended_at FROM series LIMIT 5; -- should be non-null
