-- Admin-gebruikers mogen alle rijen lezen en bijwerken in de score-gerelateerde tabellen.
-- Zonder deze policies scoort autoFill alleen de admin's eigen voorspellingen.

CREATE POLICY "Admin beheert alle voorspellingen"
  ON public.predictions FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (true);

CREATE POLICY "Admin beheert alle doorstroom"
  ON public.group_advancement FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (true);

CREATE POLICY "Admin ziet alle jokers"
  ON public.jokers FOR SELECT
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

CREATE POLICY "Admin beheert alle knockout voorspellingen"
  ON public.knockout_predictions FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (true);

CREATE POLICY "Admin beheert alle bonus antwoorden"
  ON public.bonus_answers FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (true);
