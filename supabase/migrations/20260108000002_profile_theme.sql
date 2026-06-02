-- Thema-voorkeur per gebruiker: 'default' (donker stadion) of 'retro-1988' (oranje EK-stijl)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'default'
  CHECK (theme IN ('default', 'retro-1988'));
