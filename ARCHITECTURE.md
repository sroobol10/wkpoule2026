# Architecture — WK Poule 2026

## Overview

A web app where users join a poule (pool), predict match outcomes, and compete on a leaderboard. Results are entered by an admin after each match.

## Feature Scope (Hackathon MVP)

- [ ] User registration & login (Supabase Auth)
- [ ] Browse upcoming matches (WK 2026 schedule)
- [ ] Submit predictions per match (1X2 + optional score)
- [ ] Auto-scoring after admin enters actual result
- [ ] Realtime leaderboard
- [ ] Poule/group system (invite-based, users can be in 1+ poules)
- [ ] Admin panel to enter match results

## Application Structure (Next.js App Router)

```
app/
  (auth)/
    login/
    register/
  (app)/
    dashboard/          ← poule overview, upcoming matches
    poule/[id]/         ← poule leaderboard + match list
    predict/[matchId]/  ← submit/edit prediction
    admin/              ← enter match results (protected)
  api/                  ← route handlers if needed
components/
  ui/                   ← shadcn primitives
  leaderboard/
  matches/
  predictions/
lib/
  supabase/             ← client, server, middleware helpers
  scoring.ts            ← scoring logic
  types.ts              ← generated + extended types
```

## Data Flow

```
User                Supabase            Next.js
 |                     |                   |
 |── login ──────────► Auth               |
 |◄─ session ──────────|                   |
 |                     |                   |
 |── view matches ─────────────────────── Server Component
 |                                         | ← reads DB server-side
 |◄─ rendered page ────────────────────────|
 |                     |                   |
 |── submit prediction ───────────────────► Server Action
 |                      ◄─── upsert ───────|
 |◄─ confirmation ─────────────────────────|
 |                     |                   |
 |── leaderboard ───── Realtime subscription (client)
```

## Scoring System

| Outcome | Points |
|---|---|
| Correct exact score | 5 pts |
| Correct winner / draw (wrong score) | 3 pts |
| Wrong prediction | 0 pts |

Knockout rounds: same scoring (bonus multiplier TBD post-hackathon).

## Security

- RLS on all tables — users can only read/write their own predictions
- Admin role checked via `user_metadata.role = 'admin'` or a separate `profiles` flag
- Predictions locked once match kicks off (`match.kickoff_at < now()`)
