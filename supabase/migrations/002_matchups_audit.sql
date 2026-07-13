-- ============================================================
-- Migration 002: Defensive matchups + stat edit audit log
-- ============================================================

-- Defensive matchups per game (who guarded who)
create table game_matchups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  defender_player_id uuid not null references players(id),
  offensive_player_id uuid not null references players(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (game_id, defender_player_id)
);

alter table game_matchups enable row level security;
create policy "public read matchups of published series" on game_matchups
  for select using (
    exists (
      select 1 from games g
      join series s on s.id = g.series_id
      where g.id = game_id and (s.published = true or s.status = 'complete')
    )
  );
create policy "editors full access matchups" on game_matchups for all using (auth.role() = 'authenticated');

-- Stat edit audit log
create table stat_edits (
  id uuid primary key default gen_random_uuid(),
  game_stat_id uuid not null references game_stats(id) on delete cascade,
  edited_by_email text not null,
  field_name text not null,
  old_value text,
  new_value text,
  edited_at timestamptz not null default now()
);

alter table stat_edits enable row level security;
-- Audit log is always public read (transparency)
create policy "public read stat edits" on stat_edits for select using (true);
create policy "editors insert stat edits" on stat_edits for insert with check (auth.role() = 'authenticated');

-- Add screenshot_url to games table for duplicate detection
alter table games add column if not exists screenshot_urls text[] not null default '{}';
alter table games add column if not exists screenshot_hashes text[] not null default '{}';
