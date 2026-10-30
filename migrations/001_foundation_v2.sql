-- ============================================================
-- MIGRATION 001 v2: Data Foundation (fixed for view)
-- series_player_averages is a VIEW not a table — we replace
-- it with a corrected definition instead of altering columns.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Backfill played_at using created_at
-- ------------------------------------------------------------
UPDATE games
SET played_at = created_at
WHERE played_at IS NULL;

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
-- 3. Replace the series_player_averages view with a correct
--    per-series aggregate (one row per player per series).
--    The old view had one row per game (gp always = 1).
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW series_player_averages AS
SELECT
  g.series_id,
  gs.player_id,
  p.gamertag,
  p.display_name,
  gs.side,
  COUNT(*)                                                          AS gp,
  ROUND(AVG(gs.pts)::numeric,  1)                                  AS ppg,
  ROUND(AVG(gs.reb)::numeric,  1)                                  AS rpg,
  ROUND(AVG(gs.ast)::numeric,  1)                                  AS apg,
  ROUND(AVG(gs.stl)::numeric,  1)                                  AS spg,
  ROUND(AVG(gs.blk)::numeric,  1)                                  AS bpg,
  ROUND(AVG(gs.tov)::numeric,  1)                                  AS tovpg,
  SUM(gs.fgm)                                                       AS total_fgm,
  SUM(gs.fga)                                                       AS total_fga,
  SUM(gs.tpm)                                                       AS total_tpm,
  SUM(gs.tpa)                                                       AS total_tpa,
  SUM(gs.ftm)                                                       AS total_ftm,
  SUM(gs.fta)                                                       AS total_fta,
  CASE WHEN SUM(gs.fga) > 0
    THEN ROUND((SUM(gs.fgm)::numeric / SUM(gs.fga)) * 100, 1)
    ELSE NULL END                                                   AS fg_pct,
  CASE WHEN SUM(gs.tpa) > 0
    THEN ROUND((SUM(gs.tpm)::numeric / SUM(gs.tpa)) * 100, 1)
    ELSE NULL END                                                   AS three_pct,
  MAX(gs.pts)                                                       AS best_pts
FROM game_stats gs
JOIN games   g ON g.id = gs.game_id
JOIN players p ON p.id = gs.player_id
GROUP BY g.series_id, gs.player_id, p.gamertag, p.display_name, gs.side;


-- ------------------------------------------------------------
-- VERIFY
-- ------------------------------------------------------------
SELECT COUNT(*) AS spa_rows        FROM series_player_averages;
SELECT COUNT(*) AS games_with_date FROM games WHERE played_at IS NOT NULL;
SELECT name, started_at::date, ended_at::date FROM series LIMIT 5;
