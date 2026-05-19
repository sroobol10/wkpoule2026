# Data Integration — WK Poule 2026

## API Options Considered

| API | Free tier | WK 2026 | Ease of use | Verdict |
|---|---|---|---|---|
| **Sportmonks** | Trial (you have it) | Yes | Good, rich data | ✅ Use this |
| football-data.org | Yes, but only domestic leagues on free | Paid plan only | Simple REST | ❌ Paid for WK |
| api-football.com | 100 req/day | Yes | Good | ⚠️ Very tight limit |
| ESPN unofficial | No key needed | Uncertain | Fragile, undocumented | ❌ Unreliable |

**Decision: Sportmonks** — you already have trial access and it has the WK 2026 fixture data including teams, venues, and live scores.

## Sportmonks — Key Endpoints

Base URL: `https://api.sportmonks.com/v3/football`

| What | Endpoint |
|---|---|
| Tournament info | `GET /seasons?filters=leagueId:1` (FIFA WK = league ID varies, check below) |
| All fixtures | `GET /fixtures?filters=seasonId:{id}&include=participants;venue;scores` |
| Single fixture result | `GET /fixtures/{id}?include=scores` |
| Teams | `GET /teams/{id}?include=country` |
| Rounds/stages | `GET /stages?filters=seasonId:{id}` |

### Finding the WK 2026 IDs
```
GET /leagues?search=FIFA World Cup
→ note the league ID

GET /seasons?filters=leagueId:{league_id}
→ find season for 2026, note the season ID
```

## Data Strategy

### Phase 1 — Initial Seed (one-time, before launch)
Run a seed script that:
1. Fetches all 48 teams participating in WK 2026
2. Fetches all group stage fixtures (kickoff times, venues, team matchups)
3. Inserts into `teams` + `matches` tables
4. Group stage schedule is fully known now (WK starts June 11 2026)

### Phase 2 — Result Sync (during tournament)
Two options:
- **Admin-triggered**: Admin clicks "Sync results" button → calls a Next.js route handler → fetches latest finished fixtures from Sportmonks → updates `matches` table → triggers scoring
- **Scheduled**: Supabase Edge Function on cron (e.g. every 15 min during match days) — simpler for hackathon

Recommended for hackathon: **admin-triggered** (simpler, no cron setup needed)

### Phase 3 — Knockout Matches
- After group stage: fetch qualified teams + knockout fixtures from Sportmonks
- Upsert into `matches` (slots like "Winner Group A vs Runner-up Group B" resolve to real teams)
- Users can then predict knockout matches

## Seed Script Structure

```
scripts/
  seed-matches.ts    ← fetch + insert teams & group fixtures
  sync-results.ts    ← fetch finished match scores, update DB
```

Run with: `npx tsx scripts/seed-matches.ts`

## API Key Management
- Store as `SPORTMONKS_API_KEY` in `.env.local` (local) and Vercel env vars (production)
- Never expose to client — all Sportmonks calls from server only (route handlers / scripts)

## Rate Limits (Sportmonks Trial)
- Trial typically allows ~180 req/min
- The full seed (48 fixtures + 48 teams) will comfortably fit in one run
- Results sync: 1 API call per batch of fixtures — no issues

## Fallback: Static JSON Seed
If Sportmonks trial expires or has issues, the group stage schedule is fully public.
Keep a `data/wk2026-fixtures.json` as a fallback seed source.
