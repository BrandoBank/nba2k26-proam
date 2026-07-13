-- Migration 004: Series predictions + player achievements

-- Pre-series predictions (anyone can pick winner + MVP before series starts)
create table series_predictions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  predictor_gamertag text not null,
  predicted_winner text not null,        -- 'our' or 'opp'
  predicted_mvp_player_id uuid references players(id),
  predicted_series_length int,           -- how many games
  correct_winner boolean,                -- filled after series ends
  correct_mvp boolean,
  created_at timestamptz not null default now(),
  unique (series_id, predictor_gamertag)
);

alter table series_predictions enable row level security;
create policy "public read predictions" on series_predictions for select using (true);
create policy "anon insert predictions" on series_predictions for insert with check (true);
create policy "editors update predictions" on series_predictions for update using (auth.role() = 'authenticated');

-- Player achievements (milestone badges)
create table player_achievements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  achievement_id text not null,
  earned_at timestamptz not null default now(),
  series_id uuid references series(id),
  unique (player_id, achievement_id)
);

alter table player_achievements enable row level security;
create policy "public read achievements" on player_achievements for select using (true);
create policy "editors manage achievements" on player_achievements for all using (auth.role() = 'authenticated');

-- Per-game MVP (auto-computed, stored for display)
create table game_mvp (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id),
  mvp_score numeric(10,4),
  created_at timestamptz not null default now(),
  unique (game_id)
);

alter table game_mvp enable row level security;
create policy "public read game mvp" on game_mvp for select using (true);
create policy "editors manage game mvp" on game_mvp for all using (auth.role() = 'authenticated');

-- Consistency view: standard deviation of PTS across games per player per series
create or replace view player_consistency as
select
  gs.player_id,
  p.gamertag,
  g.series_id,
  count(*) as gp,
  round(avg(gs.pts)::numeric, 1) as ppg,
  round(stddev(gs.pts)::numeric, 1) as pts_stddev,
  max(gs.pts) as pts_max,
  min(gs.pts) as pts_min,
  max(gs.pts) - min(gs.pts) as pts_range,
  -- Consistency score: lower stddev relative to mean = more consistent
  case when avg(gs.pts) > 0
    then round((1 - least(stddev(gs.pts) / avg(gs.pts), 1))::numeric * 100, 1)
    else null end as consistency_score
from game_stats gs
join games g on g.id = gs.game_id
join players p on p.id = gs.player_id
where gs.pts is not null
group by gs.player_id, p.gamertag, g.series_id
having count(*) >= 2;
