# Database Schema — WK Poule 2026

## Tables

### `profiles`
Extends Supabase Auth users.
```sql
id          uuid  PK  references auth.users
username    text  UNIQUE NOT NULL
avatar_url  text
is_admin    bool  DEFAULT false
created_at  timestamptz
```

### `poules`
A group/pool that users join.
```sql
id          uuid  PK
name        text  NOT NULL
invite_code text  UNIQUE NOT NULL   -- short code to join
created_by  uuid  references profiles(id)
created_at  timestamptz
```

### `poule_members`
Many-to-many: users ↔ poules.
```sql
poule_id    uuid  references poules(id)
user_id     uuid  references profiles(id)
joined_at   timestamptz
PRIMARY KEY (poule_id, user_id)
```

### `teams`
All 48 WK 2026 national teams.
```sql
id          uuid  PK
name        text  NOT NULL
code        text  NOT NULL   -- e.g. "NED", "BRA"
flag_url    text
group_name  text             -- e.g. "A", "B", ... (null for knockout)
```

### `matches`
Full tournament schedule.
```sql
id              uuid  PK
home_team_id    uuid  references teams(id)
away_team_id    uuid  references teams(id)
kickoff_at      timestamptz  NOT NULL
stage           text  NOT NULL   -- 'group', 'r32', 'r16', 'qf', 'sf', 'final'
venue           text
home_score      int   -- null until played
away_score      int   -- null until played
result_entered  bool  DEFAULT false
```

### `predictions`
A user's prediction for a match.
```sql
id              uuid  PK
user_id         uuid  references profiles(id)
match_id        uuid  references matches(id)
predicted_home  int   NOT NULL
predicted_away  int   NOT NULL
points_awarded  int   -- computed after result, null until then
created_at      timestamptz
updated_at      timestamptz
UNIQUE (user_id, match_id)
```

### `poule_scores`
Materialized leaderboard per poule (updated by DB function/trigger after result entry).
```sql
poule_id    uuid  references poules(id)
user_id     uuid  references profiles(id)
total_pts   int   DEFAULT 0
exact_hits  int   DEFAULT 0   -- number of exact score predictions
updated_at  timestamptz
PRIMARY KEY (poule_id, user_id)
```

## Key DB Functions / Triggers

- `handle_new_user()` — trigger on `auth.users` insert → creates `profiles` row
- `calculate_points(predicted_home, predicted_away, actual_home, actual_away)` — pure SQL function returning points
- `update_scores_after_result()` — trigger on `matches` when `result_entered` flips to true → updates `predictions.points_awarded` and aggregates into `poule_scores`

## RLS Policies (summary)

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| profiles | public | own row | own row | — |
| poules | members | authenticated | creator | creator |
| poule_members | members | authenticated | — | own row |
| teams | public | admin | admin | — |
| matches | public | admin | admin | — |
| predictions | own rows | own (before kickoff) | own (before kickoff) | — |
| poule_scores | poule members | — | — | — |
