-- Ingelogde gebruikers mogen elkaars voorspellingen/antwoorden inzien
-- (deelnemersdetailpagina toonde altijd 0 voor niet-admins door te strikte RLS)

CREATE POLICY "Ingelogd ziet alle predictions"
  ON public.predictions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ingelogd ziet alle jokers"
  ON public.jokers FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ingelogd ziet alle bonus_answers"
  ON public.bonus_answers FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ingelogd ziet alle group_advancement"
  ON public.group_advancement FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ingelogd ziet alle bracket_predictions"
  ON public.bracket_predictions FOR SELECT
  USING (auth.uid() IS NOT NULL);
