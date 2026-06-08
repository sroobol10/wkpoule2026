-- Voeg 'oostenrijk' toe als geldig thema (Alpengloed-editie)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_theme_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_theme_check
  CHECK (theme IN ('default', 'retro-1988', 'oostenrijk'));
