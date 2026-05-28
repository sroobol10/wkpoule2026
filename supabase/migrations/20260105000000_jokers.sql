-- ============================================================
-- WK Poule 2026 — Joker-feature
-- ============================================================
-- Eén joker per gebruiker per dag (m.u.v. 11 juni).
-- De joker verdubbelt de punten van de gekozen wedstrijd.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Tabel: jokers
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.jokers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id    UUID        NOT NULL REFERENCES public.matches(id)  ON DELETE CASCADE,
  joker_date  DATE        NOT NULL CHECK (joker_date != '2026-06-11'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, joker_date)
);

CREATE INDEX idx_jokers_user    ON public.jokers(user_id);
CREATE INDEX idx_jokers_match   ON public.jokers(match_id);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.jokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gebruiker ziet eigen jokers"
  ON public.jokers FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Gebruiker plaatst joker"
  ON public.jokers FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Gebruiker verplaatst joker"
  ON public.jokers FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Gebruiker verwijdert joker"
  ON public.jokers FOR DELETE USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- update_scores_after_result: pas joker-verdubbeling toe
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_scores_after_result()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.result_entered = TRUE AND (OLD.result_entered = FALSE OR OLD.result_entered IS NULL) THEN

    -- 1. Bereken punten voor alle voorspellingen; verdubbel indien joker actief
    UPDATE public.predictions p
    SET
      points_awarded = public.calculate_match_points(
        p.predicted_home, p.predicted_away,
        NEW.home_score,   NEW.away_score
      ) * CASE
            WHEN EXISTS (
              SELECT 1 FROM public.jokers j
              WHERE j.user_id = p.user_id AND j.match_id = NEW.id
            ) THEN 2
            ELSE 1
          END,
      updated_at = NOW()
    WHERE p.match_id = NEW.id;

    -- 2. Herbereken poule_scores: wedstrijd + knockout + advancement + bonus
    INSERT INTO public.poule_scores (poule_id, user_id, total_pts, exact_hits, correct_results, updated_at)
    SELECT
      pm.poule_id,
      pm.user_id,
      COALESCE(pred_pts.pts,  0)
        + COALESCE(ko_pts.pts,   0)
        + COALESCE(adv_pts.pts,  0)
        + COALESCE(bon_pts.pts,  0)                                      AS total_pts,
      COALESCE(pred_pts.exact_hits,      0)                              AS exact_hits,
      COALESCE(pred_pts.correct_results, 0)                              AS correct_results,
      NOW()
    FROM public.poule_members pm

    LEFT JOIN LATERAL (
      SELECT
        SUM(pr.points_awarded)                                            AS pts,
        SUM(CASE WHEN pr.points_awarded >= 5  THEN 1 ELSE 0 END)         AS exact_hits,
        SUM(CASE WHEN pr.points_awarded BETWEEN 2 AND 4 THEN 1 ELSE 0 END) AS correct_results
      FROM public.predictions pr
      WHERE pr.user_id = pm.user_id AND pr.points_awarded IS NOT NULL
    ) pred_pts ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(kp.points_awarded) AS pts
      FROM public.knockout_predictions kp
      WHERE kp.user_id = pm.user_id AND kp.points_awarded IS NOT NULL
    ) ko_pts ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(ga.points_awarded) AS pts
      FROM public.group_advancement ga
      WHERE ga.user_id = pm.user_id AND ga.points_awarded IS NOT NULL
    ) adv_pts ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(ba.points_awarded) AS pts
      FROM public.bonus_answers ba
      WHERE ba.user_id = pm.user_id AND ba.points_awarded IS NOT NULL
    ) bon_pts ON TRUE

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
