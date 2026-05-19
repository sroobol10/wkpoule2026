-- ============================================================
-- WK Poule 2026 — Initial Schema
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PROFILES
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  username    TEXT        UNIQUE NOT NULL,
  avatar_url  TEXT,
  is_admin    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- TEAMS
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.teams (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  code        TEXT        NOT NULL,  -- ISO 3166-1 alpha-2, used for flag URL
  flag_url    TEXT        NOT NULL,
  group_name  TEXT        NOT NULL,  -- 'A' t/m 'L'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- MATCHES
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.matches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team_id    UUID        REFERENCES public.teams(id),
  away_team_id    UUID        REFERENCES public.teams(id),
  kickoff_at      TIMESTAMPTZ NOT NULL,
  stage           TEXT        NOT NULL CHECK (stage IN ('group','r32','r16','qf','sf','final')),
  venue           TEXT,
  match_number    INT,                 -- sorteervolgorde
  home_score      INT,                 -- null totdat resultaat is ingevoerd
  away_score      INT,
  result_entered  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- POULES
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.poules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  creator_id   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_code  TEXT        UNIQUE NOT NULL,
  is_general   BOOLEAN     NOT NULL DEFAULT FALSE,  -- de algemene poule
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- POULE MEMBERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.poule_members (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  poule_id  UUID        NOT NULL REFERENCES public.poules(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poule_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- POULE SCORES  (leaderboard cache, bijgewerkt via trigger)
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.poule_scores (
  poule_id        UUID    NOT NULL REFERENCES public.poules(id) ON DELETE CASCADE,
  user_id         UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_pts       INT     NOT NULL DEFAULT 0,
  exact_hits      INT     NOT NULL DEFAULT 0,
  correct_results INT     NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poule_id, user_id)
);

-- ────────────────────────────────────────────────────────────
-- PREDICTIONS  (score voorspellingen groepsfase)
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.predictions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id        UUID        NOT NULL REFERENCES public.matches(id),
  predicted_home  INT         NOT NULL,
  predicted_away  INT         NOT NULL,
  points_awarded  INT,                 -- null totdat resultaat bekend is
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, match_id)
);

-- ────────────────────────────────────────────────────────────
-- GROUP ADVANCEMENT  (welke teams gaan door per groep)
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.group_advancement (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id             UUID        NOT NULL REFERENCES public.teams(id),
  predicted_position  INT         NOT NULL CHECK (predicted_position IN (1,2,3)),
  -- 1 = groepswinnaar, 2 = nummer 2, 3 = beste nummer 3
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, team_id)
);

-- ────────────────────────────────────────────────────────────
-- KNOCKOUT PREDICTIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.knockout_predictions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id            UUID        NOT NULL REFERENCES public.matches(id),
  predicted_winner_id UUID        NOT NULL REFERENCES public.teams(id),
  points_awarded      INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, match_id)
);

-- ────────────────────────────────────────────────────────────
-- BONUS QUESTIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.bonus_questions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question            TEXT        NOT NULL,
  type                TEXT        NOT NULL CHECK (type IN ('pre_tournament','daily')),
  unlock_date         DATE,               -- voor dagelijkse vragen
  correct_answer      TEXT,               -- ingevuld door admin na afloop
  correct_answer_set  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- BONUS ANSWERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.bonus_answers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id  UUID        NOT NULL REFERENCES public.bonus_questions(id),
  answer       TEXT        NOT NULL,
  points_awarded INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, question_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_predictions_user        ON public.predictions(user_id);
CREATE INDEX idx_predictions_match       ON public.predictions(match_id);
CREATE INDEX idx_matches_stage           ON public.matches(stage);
CREATE INDEX idx_matches_kickoff         ON public.matches(kickoff_at);
CREATE INDEX idx_poule_members_user      ON public.poule_members(user_id);
CREATE INDEX idx_poule_members_poule     ON public.poule_members(poule_id);
CREATE INDEX idx_group_advancement_user  ON public.group_advancement(user_id);
CREATE INDEX idx_bonus_answers_user      ON public.bonus_answers(user_id);
CREATE INDEX idx_bonus_questions_type    ON public.bonus_questions(type);
CREATE INDEX idx_bonus_questions_date    ON public.bonus_questions(unlock_date);

-- ============================================================
-- SCORING FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_match_points(
  p_predicted_home INT,
  p_predicted_away INT,
  p_actual_home    INT,
  p_actual_away    INT
) RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  -- Exacte score
  IF p_predicted_home = p_actual_home AND p_predicted_away = p_actual_away THEN
    RETURN 5;
  END IF;
  -- Juiste uitslag (winnaar of gelijkspel)
  IF (p_predicted_home > p_predicted_away AND p_actual_home > p_actual_away)
  OR (p_predicted_home < p_predicted_away AND p_actual_home < p_actual_away)
  OR (p_predicted_home = p_predicted_away AND p_actual_home = p_actual_away)
  THEN
    RETURN 2;
  END IF;
  RETURN 0;
END;
$$;

-- ============================================================
-- TRIGGER: punten berekenen + scores bijwerken na resultaat
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_scores_after_result()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Alleen uitvoeren als result_entered net TRUE wordt
  IF NEW.result_entered = TRUE AND (OLD.result_entered = FALSE OR OLD.result_entered IS NULL) THEN

    -- 1. Bereken punten voor alle score-voorspellingen van deze wedstrijd
    UPDATE public.predictions
    SET
      points_awarded = public.calculate_match_points(
        predicted_home, predicted_away,
        NEW.home_score,  NEW.away_score
      ),
      updated_at = NOW()
    WHERE match_id = NEW.id;

    -- 2. Herbereken poule_scores voor alle leden van alle poules
    INSERT INTO public.poule_scores (poule_id, user_id, total_pts, exact_hits, correct_results, updated_at)
    SELECT
      pm.poule_id,
      pm.user_id,
      COALESCE(SUM(p.points_awarded), 0)                                                   AS total_pts,
      COALESCE(SUM(CASE WHEN p.points_awarded = 5 THEN 1 ELSE 0 END), 0)                  AS exact_hits,
      COALESCE(SUM(CASE WHEN p.points_awarded = 2 THEN 1 ELSE 0 END), 0)                  AS correct_results,
      NOW()
    FROM public.poule_members pm
    LEFT JOIN public.predictions p ON p.user_id = pm.user_id AND p.points_awarded IS NOT NULL
    GROUP BY pm.poule_id, pm.user_id
    ON CONFLICT (poule_id, user_id) DO UPDATE SET
      total_pts       = EXCLUDED.total_pts,
      exact_hits      = EXCLUDED.exact_hits,
      correct_results = EXCLUDED.correct_results,
      updated_at      = NOW();

  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_scores_after_result
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scores_after_result();

-- ============================================================
-- TRIGGER: nieuwe gebruiker → profile aanmaken + algemene poule
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_general_poule_id UUID;
BEGIN
  -- Maak profiel aan
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );

  -- Voeg toe aan algemene poule
  SELECT id INTO v_general_poule_id FROM public.poules WHERE is_general = TRUE LIMIT 1;
  IF v_general_poule_id IS NOT NULL THEN
    INSERT INTO public.poule_members (poule_id, user_id)
    VALUES (v_general_poule_id, NEW.id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.poule_scores (poule_id, user_id)
    VALUES (v_general_poule_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poule_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poule_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_advancement  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knockout_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_questions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_answers      ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Iedereen kan profielen lezen"       ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "Gebruiker bewerkt eigen profiel"    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- teams & matches — publiek leesbaar, alleen admin schrijft
CREATE POLICY "Iedereen kan teams lezen"           ON public.teams   FOR SELECT USING (TRUE);
CREATE POLICY "Admin beheert teams"                ON public.teams   FOR ALL    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));
CREATE POLICY "Iedereen kan wedstrijden lezen"     ON public.matches FOR SELECT USING (TRUE);
CREATE POLICY "Admin beheert wedstrijden"          ON public.matches FOR ALL    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

-- poules
CREATE POLICY "Leden zien hun poules"              ON public.poules FOR SELECT USING (
  is_general = TRUE OR EXISTS (SELECT 1 FROM public.poule_members WHERE poule_id = poules.id AND user_id = auth.uid())
);
CREATE POLICY "Ingelogde gebruikers maken poules"  ON public.poules FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Maker bewerkt eigen poule"          ON public.poules FOR UPDATE USING (creator_id = auth.uid());
CREATE POLICY "Maker verwijdert eigen poule"       ON public.poules FOR DELETE USING (creator_id = auth.uid());

-- poule_members
CREATE POLICY "Leden zien poule leden"             ON public.poule_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.poule_members pm2 WHERE pm2.poule_id = poule_members.poule_id AND pm2.user_id = auth.uid())
);
CREATE POLICY "Gebruiker voegt zichzelf toe"       ON public.poule_members FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Gebruiker verlaat poule"            ON public.poule_members FOR DELETE USING (user_id = auth.uid());

-- poule_scores
CREATE POLICY "Leden zien poule scores"            ON public.poule_scores FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.poule_members WHERE poule_id = poule_scores.poule_id AND user_id = auth.uid())
);

-- predictions — eigen rijen, alleen voor kickoff
CREATE POLICY "Gebruiker ziet eigen voorspellingen" ON public.predictions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Gebruiker maakt voorspelling voor kickoff" ON public.predictions FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND kickoff_at > NOW())
);
CREATE POLICY "Gebruiker wijzigt voorspelling voor kickoff" ON public.predictions FOR UPDATE USING (
  user_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND kickoff_at > NOW())
);

-- group_advancement
CREATE POLICY "Gebruiker ziet eigen doorstroom"    ON public.group_advancement FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Gebruiker slaat doorstroom op"      ON public.group_advancement FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Gebruiker wijzigt doorstroom"       ON public.group_advancement FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Gebruiker verwijdert doorstroom"    ON public.group_advancement FOR DELETE USING (user_id = auth.uid());

-- knockout_predictions
CREATE POLICY "Gebruiker ziet eigen knockout"      ON public.knockout_predictions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Gebruiker maakt knockout voorspelling" ON public.knockout_predictions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Gebruiker wijzigt knockout"         ON public.knockout_predictions FOR UPDATE USING (user_id = auth.uid());

-- bonus_questions
CREATE POLICY "Iedereen kan bonusvragen lezen"     ON public.bonus_questions FOR SELECT USING (TRUE);
CREATE POLICY "Admin beheert bonusvragen"          ON public.bonus_questions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
);

-- bonus_answers
CREATE POLICY "Gebruiker ziet eigen antwoorden"    ON public.bonus_answers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Gebruiker geeft antwoord"           ON public.bonus_answers FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Gebruiker wijzigt antwoord"         ON public.bonus_answers FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- STORAGE BUCKET voor profielfoto's
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT DO NOTHING;

CREATE POLICY "Avatar publiek leesbaar"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Gebruiker upload eigen avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "Gebruiker vervangt eigen avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);
