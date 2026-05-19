# Technical Decisions — WK Poule 2026

## Decided

### 1. Prediction style — **Exact score only**
- Users predict the exact score (e.g. 2-1)
- Points: exact score = 5 pts, correct winner = 3 pts, wrong = 0 pts
- Draws predicted correctly as draw (any draw) = 3 pts; exact 0-0, 1-1 etc = 5 pts

### 2. Auth — **Email/password only**
- Supabase Auth with email + password
- No OAuth providers for hackathon scope

### 3. Match data — **Sportmonks API** (see DATA_INTEGRATION.md)
- One-time seed script: fetch all teams + group stage matches at start
- Results sync: admin-triggered or scheduled call to Sportmonks after each match
- Knockout matches added progressively as teams qualify

### 4. Poule model — **Private poules with invite code**
- Invite-code based, users can be in multiple poules

### 5. Realtime leaderboard
- Supabase Realtime on `poule_scores` table, subscribe per poule

### 6. Scoring locked at kickoff
- Predictions locked once `match.kickoff_at <= now()`
- Enforced server-side via RLS + server action check

## Deferred for Post-Hackathon
- Tournament bracket predictor (predict full knockout tree upfront)
- Push notifications for match reminders
- Mobile app
- Payment/prize integration
