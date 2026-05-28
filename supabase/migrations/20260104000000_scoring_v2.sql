-- ============================================================
-- WK Poule 2026 — Scoring v2
-- ============================================================
-- Wijzigingen:
--   1. Nieuw 5/3/2/1/0 puntensysteem voor wedstrijdvoorspellingen
--   2. Groepseindpositie: 1 → 3 punten; points_awarded kolom aan group_advancement
--   3. Troostfinale (third_place) toegevoegd als geldig stage-type
--   4. update_scores_after_result neemt ook advancement-punten mee
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Voeg 'third_place' toe aan de stage CHECK constraint
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_stage_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_stage_check
    CHECK (stage IN ('group','r32','r16','qf','sf','third_place','final'));

-- ────────────────────────────────────────────────────────────
-- 2. Bijgewerkte scoring-functie: 5 / 3 / 2 / 1 / 0
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_match_points(
  p_predicted_home INT,
  p_predicted_away INT,
  p_actual_home    INT,
  p_actual_away    INT
) RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_correct_result   BOOLEAN;
  v_home_goals_match BOOLEAN;
  v_away_goals_match BOOLEAN;
BEGIN
  -- Exacte score
  IF p_predicted_home = p_actual_home AND p_predicted_away = p_actual_away THEN
    RETURN 5;
  END IF;

  v_correct_result :=
       (p_predicted_home > p_predicted_away AND p_actual_home > p_actual_away)
    OR (p_predicted_home < p_predicted_away AND p_actual_home < p_actual_away)
    OR (p_predicted_home = p_predicted_away AND p_actual_home = p_actual_away);

  v_home_goals_match := p_predicted_home = p_actual_home;
  v_away_goals_match := p_predicted_away = p_actual_away;

  -- Correct resultaat + één doelpunttotaal klopt
  IF v_correct_result AND (v_home_goals_match OR v_away_goals_match) THEN
    RETURN 3;
  END IF;

  -- Alleen correct resultaat
  IF v_correct_result THEN
    RETURN 2;
  END IF;

  -- Fout resultaat + één doelpunttotaal klopt
  IF v_home_goals_match OR v_away_goals_match THEN
    RETURN 1;
  END IF;

  RETURN 0;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. points_awarded toevoegen aan group_advancement
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.group_advancement
  ADD COLUMN IF NOT EXISTS points_awarded INT DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 4. update_scores_after_result: voeg advancement-punten mee
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_scores_after_result()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.result_entered = TRUE AND (OLD.result_entered = FALSE OR OLD.result_entered IS NULL) THEN

    -- 1. Herbereken wedstrijdpunten voor alle voorspellingen van deze wedstrijd
    UPDATE public.predictions
    SET
      points_awarded = public.calculate_match_points(
        predicted_home, predicted_away,
        NEW.home_score,  NEW.away_score
      ),
      updated_at = NOW()
    WHERE match_id = NEW.id;

    -- 2. Herbereken poule_scores: wedstrijd + knockout + advancement + bonus
    INSERT INTO public.poule_scores (poule_id, user_id, total_pts, exact_hits, correct_results, updated_at)
    SELECT
      pm.poule_id,
      pm.user_id,
      COALESCE(pred_pts.pts,  0)
        + COALESCE(ko_pts.pts,   0)
        + COALESCE(adv_pts.pts,  0)
        + COALESCE(bon_pts.pts,  0)                                    AS total_pts,
      COALESCE(pred_pts.exact_hits,      0)                            AS exact_hits,
      COALESCE(pred_pts.correct_results, 0)                            AS correct_results,
      NOW()
    FROM public.poule_members pm

    LEFT JOIN LATERAL (
      SELECT
        SUM(p.points_awarded)                                          AS pts,
        SUM(CASE WHEN p.points_awarded = 5 THEN 1 ELSE 0 END)         AS exact_hits,
        SUM(CASE WHEN p.points_awarded IN (2,3) THEN 1 ELSE 0 END)    AS correct_results
      FROM public.predictions p
      WHERE p.user_id = pm.user_id AND p.points_awarded IS NOT NULL
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
