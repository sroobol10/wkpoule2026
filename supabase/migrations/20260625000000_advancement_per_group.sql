-- Eindstand-scoring losgekoppeld van de knockout-bracket.
--
-- Voorheen kwamen de eindstand-punten uit group_advancement.points_awarded.
-- Die tabel bevat echter alleen de doorgangers (positie 1, 2 en de 8 beste
-- nummers 3) omdat ze tevens de bracket voedt — positie 4 en de nummers 3 van
-- niet-doorgaande groepen ontbreken, waardoor correct voorspelde posities geen
-- punten kregen.
--
-- Nieuwe opzet: per gebruiker per groep wordt het aantal correct voorspelde
-- eindposities (alle 4) maal 5 punten opgeslagen in group_standings_scores.
-- Punten tellen mee zodra een groep is gescoord (geen "alle 72"-gate).

CREATE TABLE IF NOT EXISTS public.group_standings_scores (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  points     INT  NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, group_name)
);

ALTER TABLE public.group_standings_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigen eindstand-punten zichtbaar"
  ON public.group_standings_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin beheert alle eindstand-punten"
  ON public.group_standings_scores FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (true);

-- Trigger: eindstand-punten uit group_standings_scores, direct meegeteld.
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

    -- 2. Herbereken poule_scores (eindstand-punten tellen direct mee)
    INSERT INTO public.poule_scores (poule_id, user_id, total_pts, exact_hits, correct_results, updated_at)
    SELECT
      pm.poule_id,
      pm.user_id,
      COALESCE(pred_pts.pts,  0)
        + COALESCE(ko_pts.pts,   0)
        + COALESCE(adv_pts.pts,  0)
        + COALESCE(bon_pts.pts,  0)                                           AS total_pts,
      COALESCE(pred_pts.exact_hits,      0)                                   AS exact_hits,
      COALESCE(pred_pts.correct_results, 0)                                   AS correct_results,
      NOW()
    FROM public.poule_members pm

    LEFT JOIN LATERAL (
      SELECT
        SUM(pr.points_awarded)                                                    AS pts,
        SUM(CASE WHEN pr.points_awarded >= 5  THEN 1 ELSE 0 END)                 AS exact_hits,
        SUM(CASE WHEN pr.points_awarded BETWEEN 2 AND 4 THEN 1 ELSE 0 END)       AS correct_results
      FROM public.predictions pr
      WHERE pr.user_id = pm.user_id AND pr.points_awarded IS NOT NULL
    ) pred_pts ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(kp.points_awarded) AS pts
      FROM public.knockout_predictions kp
      WHERE kp.user_id = pm.user_id AND kp.points_awarded IS NOT NULL
    ) ko_pts ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(gss.points) AS pts
      FROM public.group_standings_scores gss
      WHERE gss.user_id = pm.user_id
    ) adv_pts ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(ba.points_awarded) AS pts
      FROM public.bonus_answers ba
      WHERE ba.user_id = pm.user_id AND ba.points_awarded IS NOT NULL
    ) bon_pts ON TRUE

    ON CONFLICT (poule_id, user_id) DO UPDATE SET
      total_pts       = EXCLUDED.total_pts,
      exact_hits      = EXCLUDED.exact_hits,
      correct_results = EXCLUDED.correct_results,
      updated_at      = NOW();

  END IF;
  RETURN NEW;
END;
$$;
