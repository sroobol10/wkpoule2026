-- ============================================================
-- Joker-systeem: van 1x per dag naar 1x per groep
-- ============================================================
-- Elke gebruiker mag per groep (A–L) één joker inzetten op
-- een wedstrijd in die groep, zolang de wedstrijd nog niet
-- begonnen is.
-- ============================================================

-- 1. Verwijder jokers waarvan de wedstrijd niet meer bestaat
DELETE FROM public.jokers j
WHERE NOT EXISTS (
  SELECT 1 FROM public.matches m WHERE m.id = j.match_id
);

-- 2. Voeg group_name kolom toe (nullable eerst)
ALTER TABLE public.jokers ADD COLUMN IF NOT EXISTS group_name TEXT;

-- 3. Vul group_name vanuit match → home_team → group_name
UPDATE public.jokers j
SET group_name = t.group_name
FROM public.matches m
JOIN public.teams t ON t.id = m.home_team_id
WHERE m.id = j.match_id
  AND j.group_name IS NULL;

-- 4. Verwijder jokers die geen group_name konden krijgen (orphans)
DELETE FROM public.jokers WHERE group_name IS NULL;

-- 5. Dedupliceer: per (user_id, group_name) alleen de meest recente joker bewaren.
--    Dit lost conflicten op uit het oude per-dag systeem.
DELETE FROM public.jokers j
WHERE j.id NOT IN (
  SELECT DISTINCT ON (user_id, group_name) id
  FROM public.jokers
  ORDER BY user_id, group_name, created_at DESC
);

-- 6. Maak group_name NOT NULL
ALTER TABLE public.jokers ALTER COLUMN group_name SET NOT NULL;

-- 7. Verwijder oude constraints (namen aangemaakt door PostgreSQL)
ALTER TABLE public.jokers DROP CONSTRAINT IF EXISTS jokers_joker_date_check;
ALTER TABLE public.jokers DROP CONSTRAINT IF EXISTS jokers_user_id_joker_date_key;

-- 8. Verwijder joker_date kolom
ALTER TABLE public.jokers DROP COLUMN IF EXISTS joker_date;

-- 9. Nieuwe unieke constraint: één joker per gebruiker per groep
ALTER TABLE public.jokers
  ADD CONSTRAINT jokers_user_id_group_name_key UNIQUE (user_id, group_name);
