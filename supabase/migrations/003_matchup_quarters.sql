-- Migration 003: Quarter-by-quarter matchup switches + accolades enhancements

-- Add quarter switching to matchups
alter table game_matchups add column if not exists quarter_switches jsonb not null default '[]';
-- quarter_switches format: [{ "quarter": "Q2", "switched_to_gamertag": "KingJ287", "note": "optional" }]

-- Add submitted_by gamertag (for non-auth matchup submissions)
alter table game_matchups add column if not exists submitted_by_gamertag text;

-- Allow anon inserts on matchups (for non-editor players logging their own matchup)
-- We keep existing policies; add anon insert with gamertag verification
create policy "anon insert matchups" on game_matchups
  for insert with check (true);

create policy "anon update own matchup" on game_matchups
  for update using (true);

-- Career rivalry view: head-to-head records between players on opposite sides
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
where s.status = 'complete'
group by gs1.player_id, p1.gamertag, gs2.player_id, p2.gamertag;

-- Clutch games view: performance in deciding games (series game >= format/2 + 1)
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
  and s.status = 'complete'
group by gs.player_id, p.gamertag, p.display_name;
