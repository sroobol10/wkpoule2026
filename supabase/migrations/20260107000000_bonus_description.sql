-- Voeg description-veld toe aan bonus_questions voor subtitel/uitleg
ALTER TABLE public.bonus_questions
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;
