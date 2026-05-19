# Tech Stack — WK Poule 2026

## Frontend
- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS v4** — utility-first styling, custom football color scheme
- **TanStack Query** — client-side data fetching & caching

## Backend / Platform
- **Supabase** — managed Postgres + Auth + Realtime + Storage
  - Row Level Security (RLS) for all data access
  - Supabase Auth (email/password)
  - Realtime subscriptions for live leaderboard
  - Storage for profile pictures

## Hosting
- **Vercel** — Next.js deployment (free tier)
- **Supabase** — hosted Postgres (free tier)

## Tooling
- TypeScript strict mode
- ESLint
- Supabase CLI (`npx supabase`) — migrations + type generation
- `supabase gen types typescript` — auto-generate DB types

## Key Libraries
| Purpose | Package |
|---|---|
| DB client | `@supabase/supabase-js` |
| Auth helpers | `@supabase/ssr` |
| Forms | `react-hook-form` + `zod` |
| Date handling | `date-fns` |
| Client queries | `@tanstack/react-query` |

## Match Data
- Statisch geseed via `scripts/seed.ts` (geen externe API)
- Fallback: `data/wk2026-fixtures.json`
