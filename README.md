# Next Up Series

> NBA 2K26 Pro-Am stat tracker — drop a box score screenshot, get tier rankings, career history, and a shareable chart.

**Live:** [nba2k26-proam.netlify.app](https://nba2k26-proam.netlify.app)

---

## What It Does

Built for a competitive Pro-Am group chat that takes the game seriously. After every series:

- **Drop a box score screenshot** → AI (Claude vision) parses every stat automatically
- **Log defensive matchups** → each player self-reports who they guarded, quarter by quarter
- **Get tier rankings** → impact-weighted ELITE / STRONG / SOLID / G TIER — auto-computed, commissioner-adjustable
- **Export a shareable chart** → PNG tier list ready to drop in the group chat
- **Track careers** → cumulative stats, all-time leaderboards, head-to-head records, hot streaks
- **Rivalries & callouts** → players can challenge each other; rivals tracked across series
- **Activity feed** → group chat-style feed for posts and reactions tied to real players

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite |
| Backend | Supabase (Postgres + Auth + RLS) |
| AI | Claude (Anthropic) — screenshot parsing + ranking drafts |
| Hosting | Netlify (frontend + serverless functions) |
| Auth | Supabase email/password — players claim their profile; commissioner gates write access |
| Export | html-to-image → PNG |

---

## Features

### Core
- **AI box score parsing** — drag a screenshot, Claude reads both teams' stats in one shot
- **Stat validation** — team PTS must reconcile before save; override checkbox for edge cases
- **Duplicate game protection** — same game number blocked per series
- **New player creation** — inline from the game entry form, no separate flow
- **Bulk import** — JSON-based historical series import for commissioners

### Rankings
- **Deterministic impact engine** — weighted formula: FG% (22%), scoring (18%), defense (16%), playmaking (14%), TOV (10%), rebounds (8%), 3P% (8%) + sample size multiplier
- **AI draft** — Claude reviews stats and suggests tier placements + impact notes
- **Live rankings** — auto-refreshes as stats and matchups come in; goes FINAL when commissioner publishes
- **Tier sanity pass** — boundary enforcement so rankings don't contradict the box score

### Competitive
- **Hot streaks** — consecutive ELITE finishes tracked across series
- **Clutch gene** — separate stats for G5/G6/G7 deciding games
- **Consistency scores** — standard deviation of output across games
- **Pretender flag** — SOLID or lower on the winning team
- **Series predictions** — pick winner, MVP, and series length before it starts
- **Achievement badges** — 50% Club, MVP Dynasty, Iron Man, G Tier Regular, and more
- **Hall of Shame** — worst shooter, most turnovers, most G Tier appearances
- **Rivalries** — formal callout system; rivals tracked head-to-head across the season

### UX
- **Mobile-first PWA** — add to home screen on iOS/Android, runs like a native app
- **Bottom nav** — thumb-friendly navigation, safe area aware
- **Player profiles** — each player has a public profile page with career stats
- **Activity feed** — group-chat-style posts tied to real player identities
- **All-time leaderboard** — 9-stat tabbed leaderboard on the landing page, live refresh
- **Share links** — every series has a public URL, copy with one tap

---

## Project Structure

```
src/
├── pages/
│   ├── Landing.jsx          # Home — leaderboard, superlatives, streaks
│   ├── Home.jsx             # Authenticated home / dashboard entry
│   ├── Dashboard.jsx        # All series list
│   ├── SeriesDetail.jsx     # Per-series — games, live rankings, stats
│   ├── GameEntry.jsx        # Add/edit game — AI screenshot + manual entry
│   ├── LogMatchup.jsx       # Public matchup logging (no login required)
│   ├── RankingEditor.jsx    # Tier editor — AI draft + manual adjust
│   ├── SeriesChart.jsx      # Shareable tier-list chart + PNG export
│   ├── NewSeries.jsx        # Create a new series (commissioner only)
│   ├── Import.jsx           # Bulk JSON series import (commissioner only)
│   ├── Accolades.jsx        # Series awards — positive + hall of shame
│   ├── History.jsx          # All-time leaders, series log, tier tracker
│   ├── Profile.jsx          # Public player profile + career stats
│   ├── Claim.jsx            # Link your Supabase account to your player row
│   ├── Feed.jsx             # Activity feed — posts tied to player identities
│   ├── Rivalries.jsx        # Callout system + rival matchup tracking
│   └── Login.jsx            # Sign in / create account
├── contexts/
│   └── AuthContext.jsx      # Session, gamertag, isEditor — provided app-wide
├── components/
│   ├── MobileNav.jsx        # Bottom nav (mobile only)
│   ├── PageHeader.jsx       # Compact header for inner pages
│   └── CustomSelect.jsx     # Reusable dropdown component
├── lib/
│   ├── ranking.js           # Deterministic impact score engine
│   ├── achievements.js      # Achievement computation + catalogue
│   ├── theme.js             # Color system + stat color helpers
│   ├── icons.jsx            # Custom SVG icon set
│   └── supabase.js          # Supabase client (anon key only)
└── hooks/
    ├── useCareerStats.js    # Career stat aggregation hook
    ├── usePlayers.js        # Player list hook
    └── useSeriesData.js     # Series + games data hook

netlify/functions/
├── parse-screenshot.js      # Claude vision → structured box score JSON
├── rank-series.js           # Claude → tier rankings + impact notes
├── add-game.js              # Validated game + stat row insertion
├── save-matchup.js          # Matchup logging (bypasses RLS for anon players)
├── import-history.js        # Bulk series import (commissioner only)
└── _ratelimit.js            # Shared per-IP rate limiting utility

supabase/migrations/
├── 001_initial_schema.sql               # Core tables, views, RLS, seed players
├── 002_matchups_audit.sql               # Matchups, stat edits, screenshot storage
├── 003_matchup_quarters.sql             # Quarter switches, H2H view, clutch stats
├── 004_predictions_achievements.sql     # Predictions, achievements, game MVP
├── 005_draft_tracker.sql                # Draft tracker table
├── 006_series_unfinished_grants.sql     # In-progress series visibility
├── 007_save_matchup_fn.sql              # save_matchup RPC function
├── 008_read_matchups_fn.sql             # read_matchups RPC function
├── 009_get_game_matchups_fn.sql         # get_game_matchups RPC function
├── 010_players_user_id.sql              # user_id column on players
├── 011_comments_table.sql               # Feed/comments table
├── 012_players_self_update_policy.sql   # Players can update their own row
├── 013_comments_rls_hardening.sql       # Comments insert/delete RLS
├── 014_callouts_rls_hardening.sql       # Callouts RLS policies
├── 015_save_matchup_auth_check.sql      # Auth check inside save_matchup fn
├── 016_achievements_commissioner_only.sql
├── 017_rankings_awards_commissioner_only.sql
├── 018_series_games_commissioner_only.sql
├── 019_predictions_anon_upsert.sql
├── 020_game_matchups_rls.sql
├── 021_stat_edits_commissioner_only.sql
├── 022_api_usage_table.sql              # Anthropic API cost logging
├── 023_fix_players_claim_release.sql    # Fix claim/release flows after migration 012
└── 024_players_insert_commissioner_only.sql  # Restrict player creation to commissioner
```

---

## Data Model (key tables)

```sql
players              -- gamertag, display_name, user_id (nullable — links to auth)
series               -- name, teams, format, status, wins, storyline
games                -- series_id, game_number, scores, result
game_stats           -- per-player per-game: pts/reb/ast/stl/blk/tov/fgm/fga/tpm/tpa
game_matchups        -- defender → offensive player, quarter switches (JSONB)
series_rankings      -- tier, rank_in_tier, is_mvp, tags, impact_note, impact_score
series_awards        -- MVP, Lockdown, Pretender, etc.
series_predictions   -- pre-series picks (winner, MVP, length)
player_achievements  -- milestone badges (earned_at, series_id)
comments             -- feed posts tied to a player row
callouts             -- challenger → challenged, status, series context
api_usage            -- Anthropic API token counts + estimated cost per call
```

**Views:** `series_player_stats`, `career_player_totals`, `player_head_to_head`, `clutch_game_stats`, `player_consistency`

---

## Security

### Transport & Headers
- `Strict-Transport-Security` — forces HTTPS, preload eligible
- `Content-Security-Policy` — allowlists self + Supabase; blocks inline scripts, frames, and unknown origins
- `X-Frame-Options: DENY` — clickjacking prevention
- `X-Content-Type-Options: nosniff` — MIME sniffing prevention
- `Referrer-Policy: strict-origin-when-cross-origin` — no URL leakage to third parties
- `Permissions-Policy` — camera, mic, geolocation, and payment APIs explicitly disabled

### Serverless Functions
| Concern | Measure |
|---|---|
| AI endpoint abuse | Rate limited: 10 req/60s (parse), 5 req/60s (rank) per IP |
| Oversized payloads | Image capped at ~10 MB before reaching Anthropic |
| Media type injection | `media_type` allowlisted to `image/*` only |
| Base64 injection | Regex validates only legal base64 characters |
| Prompt injection via stats | Stat objects stripped to known-safe keys + numeric fields clamped before Claude sees them |
| UUID tampering | `series_id` validated against UUID regex before use |
| Player count DoS | `stats` array capped at 20 players |
| Auth enforcement | Every write function verifies the JWT and checks commissioner status before acting |
| Key exposure | `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` server-side only, never bundled into client JS |

### Database (Supabase RLS)
- **Public** — `SELECT` on published/complete series, players, rankings
- **Authenticated players** — update their own claimed player row; insert/delete their own feed posts; manage their own callouts
- **Commissioner only** — INSERT/UPDATE/DELETE on series, games, game_stats, rankings, awards, achievements, stat_edits, and player creation
- **Anyone** — `INSERT` on `game_matchups` (self-reported defensive assignments, no account required)
- Service role key used only in Netlify functions, never in the browser bundle

**24 migrations** progressively harden every table from open access to least-privilege RLS.

### What's Not Needed Here
No CSRF tokens — Supabase auth uses `Authorization` headers (not cookies), so there's no cross-site request surface. No SQL injection risk — all DB access goes through the Supabase JS client which parameterizes everything.

---

## Auth Model

| Role | Access |
|---|---|
| Public | Read all published/complete series, stats, rankings, charts, player profiles |
| Authenticated player | Claim a player row, post to feed, log callouts, update own display name |
| Commissioner (`BrandoBank`) | Full write access — create series, add games, edit rankings, import history |
| Anyone | Log defensive matchups on any game (no account required) |

RLS enforces this at the database level — the frontend `isEditor` flag is a UI convenience only. All writes are validated server-side.

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
# Apply supabase/migrations/*.sql in Supabase SQL editor in order (001 → 024)

# 5. Start dev server
npm run dev

# 6. Run functions locally (requires Netlify CLI)
netlify dev
```

---

## Environment Variables

| Variable | Where Used |
|---|---|
| `VITE_SUPABASE_URL` | Frontend Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Frontend Supabase client (public, read-only RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify functions only — bypasses RLS for commissioner writes |
| `ANTHROPIC_API_KEY` | Screenshot parsing + AI ranking drafts |

---

## Deployment

Hosted on Netlify with automatic deploys from `main`. Functions are bundled with esbuild.

```bash
netlify deploy --prod
```

The `/* → /index.html` redirect in `netlify.toml` handles SPA routing.
