-- ============================================================
-- NBA 2K26 Pro-Am Series Tracker — Initial Schema
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table players (
  id uuid primary key default gen_random_uuid(),
  gamertag text not null unique,
  display_name text,
  default_position text check (default_position in ('PG','SG','SF','PF','C')),
  notes text,
  created_at timestamptz not null default now()
);

create type series_status as enum ('in_progress', 'complete');

create table series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format int not null default 7,
  our_team_name text not null default 'scooooorbooooord',
  opp_team_name text not null,
  status series_status not null default 'in_progress',
  our_wins int not null default 0,
  opp_wins int not null default 0,
  result_label text,
  storyline text,
  published boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create type game_result as enum ('W', 'L');

create table games (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  game_number int not null,
  our_score int not null,
  opp_score int not null,
  our_result game_result not null,
  brando_position text,
  played_at timestamptz,
  created_at timestamptz not null default now(),
  unique (series_id, game_number)
);

create type player_side as enum ('our', 'opp');

create table game_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id),
  side player_side not null,
  grade text,
  pts int not null default 0,
  reb int not null default 0,
  ast int not null default 0,
  stl int not null default 0,
  blk int not null default 0,
  fouls int not null default 0,
  tov int not null default 0,
  fgm int not null default 0,
  fga int not null default 0,
  tpm int not null default 0,
  tpa int not null default 0,
  ftm int not null default 0,
  fta int not null default 0,
  screenshot_url text,
  unique (game_id, player_id)
);

create type tier_level as enum ('ELITE', 'STRONG', 'SOLID', 'G_TIER', 'BENCHED');

create table series_rankings (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  player_id uuid not null references players(id),
  tier tier_level not null,
  rank_in_tier int not null default 1,
  is_mvp boolean not null default false,
  primary_side player_side not null default 'our',
  tags text[] not null default '{}',
  impact_note text,
  impact_score numeric(10,4),
  ai_draft jsonb,
  finalized boolean not null default false,
  unique (series_id, player_id)
);

create table series_awards (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  player_id uuid not null references players(id),
  award text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- VIEWS
-- ============================================================

-- Per-player per-series averages (FG%/3P% from summed makes/attempts)
create or replace view series_player_averages as
select
  gs.game_id,
  g.series_id,
  gs.player_id,
  p.gamertag,
  p.display_name,
  gs.side,
  count(*) as gp,
  round(avg(gs.pts)::numeric, 1) as ppg,
  round(avg(gs.reb)::numeric, 1) as rpg,
  round(avg(gs.ast)::numeric, 1) as apg,
  round(avg(gs.stl)::numeric, 1) as spg,
  round(avg(gs.blk)::numeric, 1) as bpg,
  round(avg(gs.tov)::numeric, 1) as tovpg,
  sum(gs.fgm) as total_fgm,
  sum(gs.fga) as total_fga,
  sum(gs.tpm) as total_tpm,
  sum(gs.tpa) as total_tpa,
  sum(gs.ftm) as total_ftm,
  sum(gs.fta) as total_fta,
  case when sum(gs.fga) > 0 then round((sum(gs.fgm)::numeric / sum(gs.fga) * 100), 1) else null end as fg_pct,
  case when sum(gs.tpa) > 0 then round((sum(gs.tpm)::numeric / sum(gs.tpa) * 100), 1) else null end as three_pct,
  max(gs.pts) as best_pts
from game_stats gs
join games g on g.id = gs.game_id
join players p on p.id = gs.player_id
group by gs.game_id, g.series_id, gs.player_id, p.gamertag, p.display_name, gs.side;

-- Cleaner per-series aggregate (one row per player per series)
create or replace view series_player_stats as
select
  g.series_id,
  gs.player_id,
  p.gamertag,
  p.display_name,
  -- Use the side they played most
  (select side from game_stats gs2
   join games g2 on g2.id = gs2.game_id
   where gs2.player_id = gs.player_id and g2.series_id = g.series_id
   group by side order by count(*) desc limit 1) as primary_side,
  count(*) as gp,
  round(avg(gs.pts)::numeric, 1) as ppg,
  round(avg(gs.reb)::numeric, 1) as rpg,
  round(avg(gs.ast)::numeric, 1) as apg,
  round(avg(gs.stl)::numeric, 1) as spg,
  round(avg(gs.blk)::numeric, 1) as bpg,
  round(avg(gs.tov)::numeric, 1) as tovpg,
  sum(gs.fgm) as total_fgm,
  sum(gs.fga) as total_fga,
  sum(gs.tpm) as total_tpm,
  sum(gs.tpa) as total_tpa,
  case when sum(gs.fga) > 0 then round((sum(gs.fgm)::numeric / sum(gs.fga) * 100), 1) else null end as fg_pct,
  case when sum(gs.tpa) > 0 then round((sum(gs.tpm)::numeric / sum(gs.tpa) * 100), 1) else null end as three_pct,
  max(gs.pts) as best_pts,
  -- Check if played both sides (SWING)
  count(distinct gs.side) > 1 as is_swing
from game_stats gs
join games g on g.id = gs.game_id
join players p on p.id = gs.player_id
group by g.series_id, gs.player_id, p.gamertag, p.display_name;

-- Career totals across all completed series
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
where s.status = 'complete'
group by gs.player_id, p.gamertag, p.display_name;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table players enable row level security;
alter table series enable row level security;
alter table games enable row level security;
alter table game_stats enable row level security;
alter table series_rankings enable row level security;
alter table series_awards enable row level security;

-- Public read: anyone can read published series and all related data
create policy "public read players" on players for select using (true);

create policy "public read published series" on series
  for select using (published = true or status = 'complete');

create policy "public read games of published series" on games
  for select using (
    exists (
      select 1 from series s
      where s.id = series_id and (s.published = true or s.status = 'complete')
    )
  );

create policy "public read game_stats of published series" on game_stats
  for select using (
    exists (
      select 1 from games g
      join series s on s.id = g.series_id
      where g.id = game_id and (s.published = true or s.status = 'complete')
    )
  );

create policy "public read rankings of published series" on series_rankings
  for select using (
    exists (
      select 1 from series s
      where s.id = series_id and (s.published = true or s.status = 'complete')
    )
  );

create policy "public read awards of published series" on series_awards
  for select using (
    exists (
      select 1 from series s
      where s.id = series_id and (s.published = true or s.status = 'complete')
    )
  );

-- Authenticated editors can do everything
create policy "editors full access players" on players for all using (auth.role() = 'authenticated');
create policy "editors full access series" on series for all using (auth.role() = 'authenticated');
create policy "editors full access games" on games for all using (auth.role() = 'authenticated');
create policy "editors full access game_stats" on game_stats for all using (auth.role() = 'authenticated');
create policy "editors full access rankings" on series_rankings for all using (auth.role() = 'authenticated');
create policy "editors full access awards" on series_awards for all using (auth.role() = 'authenticated');

-- ============================================================
-- SEED: Player Pool
-- ============================================================

insert into players (gamertag, display_name, default_position, notes) values
  ('BrandoBank',       'Brando',   'SG', 'Secondary scorer + gravity. Guards opp #2 scorer. SG default, switches to C build. Our squad.'),
  ('JuliusIsBrown',    'Julius',   'SF', 'Primary scorer, league-leading efficiency. Our squad.'),
  ('De0nwitda2hifts',  'De0n',     'SG', 'Quick-release shooter, third gravity threat, rebounding. Our squad.'),
  ('SolanoMundo',      'Solano',   'PG', 'Elite PG facilitator, not a defender. Our squad.'),
  ('TTVxGB_2x',        'Jay',      'C',  'Rebounding + paint anchor. Our squad.'),
  ('KingJ287',         'KingJ',    'SF', 'Best player in the conference, multiple builds. Opp pool.'),
  ('Shoulders_16',     NULL,       'SG', 'Lockdown perimeter defender, usually on Brando/Julius. Opp pool.'),
  ('C4_Nando',         NULL,       'SF', '99 perimeter-lockdown build. Opp pool.'),
  ('LarBeast756',      NULL,       'SF', 'KingJ''s #2 scorer. Opp pool.'),
  ('RomeHearts',       NULL,       'PG', 'Opp pool.'),
  ('Spiderboy_305',    NULL,       'SG', 'Opp pool.'),
  ('Apocsy_',          NULL,       'SF', 'Opp pool.'),
  ('OJProjectPlanner', NULL,       'PF', 'Opp pool.'),
  ('WAREHOUSE_420',    NULL,       'C',  'Opp pool.'),
  ('IIIBTAJAHIII',     NULL,       'PG', 'Opp pool.'),
  ('SignedbyBliss',    NULL,       'SG', 'Opp pool.')
on conflict (gamertag) do nothing;
