-- Punten per bracketvoorspelling (pre-toernooi KO-picks)
ALTER TABLE public.bracket_predictions
  ADD COLUMN IF NOT EXISTS points_awarded INT DEFAULT NULL;

-- RLS: iedereen ziet eigen voorspellingen (al ingesteld), admin ziet alle
CREATE POLICY "Admin beheert alle bracket voorspellingen"
  ON public.bracket_predictions FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (true);
