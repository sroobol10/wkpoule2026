-- Admin-gebruikers mogen poule_scores en poule_members volledig beheren
-- (nodig voor recalcPouleScores in server-acties)

-- poule_scores: admins kunnen lezen en schrijven
CREATE POLICY "Admins beheren poule scores"
  ON public.poule_scores FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (true);

-- poule_members: admins kunnen alle leden van alle poules zien
CREATE POLICY "Admins zien alle poule leden"
  ON public.poule_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- poule_scores: de DB-trigger (SECURITY DEFINER) schrijft al scores,
-- maar voor directe server-side upserts voegen we ook een open write-policy toe
-- zodat authenticated-users hun eigen score-rij kunnen aanmaken bij inschrijving
CREATE POLICY "Gebruiker beheert eigen poule score"
  ON public.poule_scores FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
