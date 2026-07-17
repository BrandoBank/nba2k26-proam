# Next Up Series

> NBA 2K26 Pro-Am stat tracker — drop a box score, get tier rankings, career history, and a shareable chart.

**Live:** [nba2k26-proam.netlify.app](https://nba2k26-proam.netlify.app)

---

## What It Does

Built for a competitive Pro-Am group chat that takes the game seriously. After every series:

- **Drop a box score screenshot** → AI (Claude vision) parses every stat automatically
- **Log defensive matchups** → each player self-reports who they guarded, quarter by quarter
- **Get tier rankings** → impact-weighted ELITE / STRONG / SOLID / G TIER — auto-computed, editor-adjustable
- **Export a shareable chart** → PNG tier list matching the crew's template, ready to drop in the group chat
- **Track careers** → cumulative stats, all-time leaderboards, head-to-head records, hot streaks

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 8 |
| Backend | Supabase (Postgres + Auth + RLS) |
| AI | Claude claude-opus-4-6 — screenshot parsing + ranking drafts |
| Hosting | Netlify (frontend) + Netlify Functions (serverless) |
| Auth | Supabase email/password — editors only; public read via RLS |
| Export | html-to-image → PNG |

---

## Features

### Core
- **AI box score parsing** — drag a screenshot, Claude reads both teams' stats in one shot
- **Stat validation** — team PTS must reconcile before save; override checkbox for edge cases
- **Duplicate game protection** — same game number blocked per series
- **New player creation** — inline from the game entry form, no separate flow

### Rankings
- **Deterministic impact engine** — weighted formula: FG% (22%), scoring (18%), defense (16%), playmaking (14%), TOV (10%), rebounds (8%), 3P% (8%) + sample size multiplier
- **AI draft** — Claude claude-opus-4-6 reviews stats and suggests tier placements + impact notes
- **Live rankings** — auto-refreshes on the series page as stats and matchups come in; goes FINAL when editor publishes
- **Tier sanity pass** — boundary enforcement so rankings don't contradict the box score

### Competitive
- **Hot streaks** — consecutive ELITE finishes tracked across series
- **Clutch gene** — separate stats for G5/G6/G7 deciding games
- **Consistency scores** — standard deviation of output across games (lower variance = more reliable)
- **Pretender flag** — SOLID or lower on the winning team
- **Series predictions** — pick winner, MVP, and series length before it starts
- **Achievement badges** — 50% Club, MVP Dynasty, Iron Man, G Tier Regular, and more
- **Hall of Shame** — worst shooter, most turnovers, most G Tier appearances, all-time exposed

### UX
- **Mobile-first PWA** — add to home screen on iOS/Android, runs like a native app
- **Bottom nav** — thumb-friendly navigation, safe area aware
- **All-time leaderboard** — 9-stat tabbed leaderboard on the landing page, live refresh
- **2K27 countdown** — ticker bar counts down to NBA 2K27 early access (Aug 28) and release (Sep 4, 2026)
- **Matchup CTA** — non-editors can log their defensive assignments without an account
- **Share links** — every series has a public URL, copy with one tap

---

## Project Structure

```
src/
├── pages/
│   ├── Landing.jsx          # Home — leaderboard, superlatives, streaks
│   ├── Dashboard.jsx        # All series list
│   ├── SeriesDetail.jsx     # Per-series — games, live rankings, stats
│   ├── GameEntry.jsx        # Add/edit game — AI screenshot + manual entry
│   ├── LogMatchup.jsx       # Public matchup logging (no login)
│   ├── RankingEditor.jsx    # Tier editor — AI draft + manual adjust
│   ├── SeriesChart.jsx      # Shareable tier-list chart + PNG export
│   ├── Accolades.jsx        # Series awards — positive + hall of shame
│   └── History.jsx          # All-time leaders, series log, tier tracker
├── components/
│   ├── MobileNav.jsx        # Bottom nav (mobile only)
│   └── PageHeader.jsx       # Compact header for inner pages
├── lib/
│   ├── ranking.js           # Deterministic impact score engine
│   ├── achievements.js      # Achievement computation + catalogue
│   ├── theme.js             # Color system + stat color helpers
│   ├── icons.jsx            # Custom SVG icon set
│   └── supabase.js          # Supabase client
└── hooks/
    └── useAuth.js           # Session, isEditor, signIn/signOut

netlify/functions/
├── parse-screenshot.js      # Claude vision → structured box score JSON
└── rank-series.js           # Claude claude-opus-4-6 → tier rankings + impact notes

supabase/migrations/
├── 001_initial_schema.sql   # Core tables + views + RLS + seed players
├── 002_matchups_audit.sql   # Matchups, stat edits, screenshot storage
├── 003_matchup_quarters.sql # Quarter switches, H2H view, clutch stats view
└── 004_predictions_achievements.sql  # Predictions, achievements, game MVP, consistency view
```

---

## Data Model (key tables)

```sql
players           -- gamertag, display_name, position
series            -- name, teams, format, status, wins, storyline
games             -- series_id, game_number, scores, result
game_stats        -- per-player per-game: pts/reb/ast/stl/blk/tov/fgm/fga/tpm/tpa
game_matchups     -- defender → offensive player, quarter switches (JSONB)
series_rankings   -- tier, rank_in_tier, is_mvp, tags, impact_note, impact_score
series_awards     -- MVP, Lockdown, Pretender, etc.
series_predictions-- pre-series picks (winner, MVP, length)
player_achievements-- milestone badges (earned_at, series_id)
```

**Views:** `series_player_stats`, `career_player_totals`, `player_head_to_head`, `clutch_game_stats`, `player_consistency`

---

## Auth Model

- **Public** — read all published/complete series, stats, rankings, charts
- **Editor** — full CRUD via Supabase email/password auth
- **Anyone** — can log their own defensive matchup on any game (no account required)

RLS enforces this at the database level — the frontend never trusts client-side role checks alone.

---

## Local Development

```bash
# 1. Clone
git clone https://github.com/BrandoBank/nba2k26-proam.git
cd nba2k26-proam

# 2. Install
npm install

# 3. Environment
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

# 4. Run migrations
# Paste supabase/migrations/*.sql into Supabase SQL editor in order

# 5. Start
npm run dev

# 6. Functions (requires Netlify CLI)
netlify dev
```

---

## Environment Variables

| Variable | Where Used |
|---|---|
| `VITE_SUPABASE_URL` | Frontend Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Frontend Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify functions (bypasses RLS for writes) |
| `ANTHROPIC_API_KEY` | Screenshot parsing + AI ranking drafts |

---

## Deployment

Hosted on Netlify with automatic deploys from `main`. Functions are bundled with esbuild.

```bash
netlify deploy --prod
```

The `/* → /index.html` redirect in `netlify.toml` handles SPA routing.
