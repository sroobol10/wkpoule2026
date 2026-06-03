-- Puntentelling v3: hogere punten voor betere voorspellingen
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
    RETURN 10;
  END IF;

  v_correct_result :=
       (p_predicted_home > p_predicted_away AND p_actual_home > p_actual_away)
    OR (p_predicted_home < p_predicted_away AND p_actual_home < p_actual_away)
    OR (p_predicted_home = p_predicted_away AND p_actual_home = p_actual_away);

  v_home_goals_match := p_predicted_home = p_actual_home;
  v_away_goals_match := p_predicted_away = p_actual_away;

  -- Correct resultaat + één doelpunttotaal klopt
  IF v_correct_result AND (v_home_goals_match OR v_away_goals_match) THEN
    RETURN 7;
  END IF;

  -- Alleen correct resultaat
  IF v_correct_result THEN
    RETURN 5;
  END IF;

  -- Fout resultaat + één doelpunttotaal klopt
  IF v_home_goals_match OR v_away_goals_match THEN
    RETURN 2;
  END IF;

  RETURN 0;
END;
$$;
