-- Uitgebreide puntenverdeling per categorie in poule_scores
ALTER TABLE public.poule_scores
  ADD COLUMN IF NOT EXISTS group_match_pts     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS group_standings_pts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS knockout_pts        INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_pre_pts       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_daily_pts     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jokers_played       SMALLINT NOT NULL DEFAULT 0;
