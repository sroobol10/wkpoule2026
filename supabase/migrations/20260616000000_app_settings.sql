-- Sleutel/waarde-instellingen die de admin beheert (bv. de GOAT-doelpuntenstand).
CREATE TABLE public.app_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Iedereen mag lezen; schrijven gebeurt via de service role (admin-actie)
CREATE POLICY "Iedereen ziet app_settings" ON public.app_settings FOR SELECT USING (TRUE);

-- GOAT-duel: doelpuntenstand Messi vs Ronaldo
INSERT INTO public.app_settings (key, value) VALUES
  ('goat_messi_goals', '0'),
  ('goat_ronaldo_goals', '0')
ON CONFLICT (key) DO NOTHING;
