-- Alles op slot zodra de eerste WK-wedstrijd is afgetrapt (start toernooi).
-- Geldt voor: wedstrijdvoorspellingen, eindstanden (doorstroom), bracket en
-- pre-tournament bonusvragen. Uitzonderingen met eigen deadline-logica:
-- jokers, dagelijkse bonusvragen en knockout-winnaarvoorspellingen.
-- Admin-policies (aparte ALL-policies) blijven onaangetast voor scoring.

CREATE OR REPLACE FUNCTION public.tournament_started()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.matches WHERE kickoff_at <= NOW());
$$;

-- ── predictions ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Gebruiker maakt voorspelling voor kickoff" ON public.predictions;
CREATE POLICY "Gebruiker maakt voorspelling voor kickoff" ON public.predictions FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND NOT public.tournament_started()
  AND EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND kickoff_at > NOW())
);

DROP POLICY IF EXISTS "Gebruiker wijzigt voorspelling voor kickoff" ON public.predictions;
CREATE POLICY "Gebruiker wijzigt voorspelling voor kickoff" ON public.predictions FOR UPDATE USING (
  user_id = auth.uid()
  AND NOT public.tournament_started()
  AND EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND kickoff_at > NOW())
);

-- ── group_advancement (eindstanden) ─────────────────────────────────────────
DROP POLICY IF EXISTS "Gebruiker slaat doorstroom op" ON public.group_advancement;
CREATE POLICY "Gebruiker slaat doorstroom op" ON public.group_advancement FOR INSERT WITH CHECK (
  user_id = auth.uid() AND NOT public.tournament_started()
);

DROP POLICY IF EXISTS "Gebruiker wijzigt doorstroom" ON public.group_advancement;
CREATE POLICY "Gebruiker wijzigt doorstroom" ON public.group_advancement FOR UPDATE USING (
  user_id = auth.uid() AND NOT public.tournament_started()
);

DROP POLICY IF EXISTS "Gebruiker verwijdert doorstroom" ON public.group_advancement;
CREATE POLICY "Gebruiker verwijdert doorstroom" ON public.group_advancement FOR DELETE USING (
  user_id = auth.uid() AND NOT public.tournament_started()
);

-- ── bracket_predictions ──────────────────────────────────────────────────────
-- De oude ALL-policy dekte ook SELECT; lezen blijft mogelijk via een eigen
-- SELECT-policy (en "Ingelogd ziet alle bracket_predictions" uit een eerdere
-- migration), schrijven kan alleen tot de toernooistart.
DROP POLICY IF EXISTS "users can manage own bracket predictions" ON public.bracket_predictions;

CREATE POLICY "Gebruiker ziet eigen bracket" ON public.bracket_predictions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Gebruiker beheert bracket tot toernooistart" ON public.bracket_predictions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND NOT public.tournament_started())
  WITH CHECK (user_id = auth.uid() AND NOT public.tournament_started());

-- ── knockout_predictions ─────────────────────────────────────────────────────
-- Ook de KO-voorspellingen (wie gaat door t/m de finale) zijn pre-tournament
-- en gaan dicht bij de toernooistart.
DROP POLICY IF EXISTS "Gebruiker maakt knockout voorspelling" ON public.knockout_predictions;
CREATE POLICY "Gebruiker maakt knockout voorspelling" ON public.knockout_predictions FOR INSERT WITH CHECK (
  user_id = auth.uid() AND NOT public.tournament_started()
);

DROP POLICY IF EXISTS "Gebruiker wijzigt knockout" ON public.knockout_predictions;
CREATE POLICY "Gebruiker wijzigt knockout" ON public.knockout_predictions FOR UPDATE USING (
  user_id = auth.uid() AND NOT public.tournament_started()
);

-- ── bonus_answers ────────────────────────────────────────────────────────────
-- Dagelijkse vragen blijven open (eigen dagdeadline in de app); pre-tournament
-- vragen gaan dicht bij de toernooistart.
DROP POLICY IF EXISTS "Gebruiker geeft antwoord" ON public.bonus_answers;
CREATE POLICY "Gebruiker geeft antwoord" ON public.bonus_answers FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (
    NOT public.tournament_started()
    OR EXISTS (SELECT 1 FROM public.bonus_questions q WHERE q.id = question_id AND q.type = 'daily')
  )
);

DROP POLICY IF EXISTS "Gebruiker wijzigt antwoord" ON public.bonus_answers;
CREATE POLICY "Gebruiker wijzigt antwoord" ON public.bonus_answers FOR UPDATE USING (
  user_id = auth.uid() AND (
    NOT public.tournament_started()
    OR EXISTS (SELECT 1 FROM public.bonus_questions q WHERE q.id = question_id AND q.type = 'daily')
  )
);
