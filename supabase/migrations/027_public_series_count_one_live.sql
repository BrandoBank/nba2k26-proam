-- Site-wide stats rule + one live series at a time.
--
-- 1. Career totals, head-to-head and clutch stats used to count only series
--    with status 'complete'. Live series (even published ones) and series
--    marked 'unfinished' never reached careers or leaderboards. New rule —
--    the same one RLS already uses for public reads: a series counts once it
--    is public, i.e. published by the commissioner OR complete. Games only
--    reach these tables after commissioner approval, so nothing unreviewed
--    can leak in.
-- 2. Only one series may be in_progress. The older live series
--    (Oct 31 Pickup · BO3, 1-1) is closed as 'unfinished' first.

UPDATE series
SET status = 'unfinished', ended_at = coalesce(ended_at, now())
WHERE id = 'f5220101-45f0-485e-8f71-9bf491c1bd3d' AND status = 'in_progress';

CREATE UNIQUE INDEX IF NOT EXISTS series_one_live
  ON series ((status)) WHERE status = 'in_progress';

create or replace view career_player_totals as
select
  gs.player_id,
  p.gamertag,
  p.display_name,
  count(distinct g.series_id) as series_played,
  count(*) as total_gp,
  round(avg(gs.pts)::numeric, 1) as career_ppg,
  round(avg(gs.reb)::numeric, 1) as career_rpg,
  round(avg(gs.ast)::numeric, 1) as career_apg,
  round(avg(gs.stl)::numeric, 1) as career_spg,
  round(avg(gs.blk)::numeric, 1) as career_bpg,
  round(avg(gs.tov)::numeric, 1) as career_tovpg,
  sum(gs.fgm) as career_fgm,
  sum(gs.fga) as career_fga,
  sum(gs.tpm) as career_tpm,
  sum(gs.tpa) as career_tpa,
  case when sum(gs.fga) > 0 then round((sum(gs.fgm)::numeric / sum(gs.fga) * 100), 1) else null end as career_fg_pct,
  case when sum(gs.tpa) > 0 then round((sum(gs.tpm)::numeric / sum(gs.tpa) * 100), 1) else null end as career_3p_pct,
  -- Win% when on our side
  round(
    (count(*) filter (where gs.side = 'our' and ga.our_result = 'W'))::numeric /
    nullif(count(*) filter (where gs.side = 'our'), 0) * 100
  , 1) as our_side_win_pct,
  -- Count MVP awards
  (select count(*) from series_rankings sr
   where sr.player_id = gs.player_id and sr.is_mvp = true) as mvp_count,
  -- Tier appearance counts
  (select count(*) from series_rankings sr where sr.player_id = gs.player_id and sr.tier = 'ELITE') as elite_count,
  (select count(*) from series_rankings sr where sr.player_id = gs.player_id and sr.tier = 'STRONG') as strong_count,
  (select count(*) from series_rankings sr where sr.player_id = gs.player_id and sr.tier = 'SOLID') as solid_count,
  (select count(*) from series_rankings sr where sr.player_id = gs.player_id and sr.tier = 'G_TIER') as g_tier_count
from game_stats gs
join games g on g.id = gs.game_id
join games ga on ga.id = gs.game_id
join series s on s.id = g.series_id
join players p on p.id = gs.player_id
where (s.published = true or s.status = 'complete')
group by gs.player_id, p.gamertag, p.display_name;

create or replace view player_head_to_head as
select
  gs1.player_id as player_a_id,
  p1.gamertag as player_a,
  gs2.player_id as player_b_id,
  p2.gamertag as player_b,
  count(*) as games_shared,
  count(*) filter (where
    (gs1.side = 'our' and ga.our_result = 'W') or
    (gs1.side = 'opp' and ga.our_result = 'L')
  ) as player_a_wins,
  count(*) filter (where
    (gs1.side = 'our' and ga.our_result = 'L') or
    (gs1.side = 'opp' and ga.our_result = 'W')
  ) as player_a_losses
from game_stats gs1
join game_stats gs2 on gs2.game_id = gs1.game_id and gs2.side != gs1.side
join games ga on ga.id = gs1.game_id
join series s on s.id = ga.series_id
join players p1 on p1.id = gs1.player_id
join players p2 on p2.id = gs2.player_id
where (s.published = true or s.status = 'complete')
group by gs1.player_id, p1.gamertag, gs2.player_id, p2.gamertag;

create or replace view clutch_game_stats as
select
  gs.player_id,
  p.gamertag,
  p.display_name,
  count(*) as clutch_gp,
  round(avg(gs.pts)::numeric, 1) as clutch_ppg,
  round(avg(gs.ast)::numeric, 1) as clutch_apg,
  case when sum(gs.fga) > 0 then round((sum(gs.fgm)::numeric / sum(gs.fga) * 100), 1) else null end as clutch_fg_pct,
  count(*) filter (where
    (gs.side = 'our' and ga.our_result = 'W') or
    (gs.side = 'opp' and ga.our_result = 'L')
  ) as clutch_wins
from game_stats gs
join games ga on ga.id = gs.game_id
join series s on s.id = ga.series_id
join players p on p.id = gs.player_id
where ga.game_number >= ceil(s.format::numeric / 2) + 1
  and (s.published = true or s.status = 'complete')
group by gs.player_id, p.gamertag, p.display_name;
