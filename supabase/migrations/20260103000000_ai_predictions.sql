-- ============================================================
-- WK Poule 2026 — AI Match Predictions (cached per match)
-- ============================================================

CREATE TABLE public.match_ai_predictions (
  match_id            UUID  PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  home_score          INT   NOT NULL,
  away_score          INT   NOT NULL,
  match_analyse       TEXT  NOT NULL,
  sleutelspeler_thuis TEXT  NOT NULL,
  sleutelspeler_uit   TEXT  NOT NULL,
  kans_thuis          INT   NOT NULL,  -- percentage 0-100
  kans_gelijkspel     INT   NOT NULL,
  kans_uit            INT   NOT NULL,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.match_ai_predictions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read shared predictions
CREATE POLICY "authenticated users can read ai predictions"
  ON public.match_ai_predictions FOR SELECT TO authenticated USING (true);

-- Any authenticated user can generate (upsert) a prediction — first writer wins
CREATE POLICY "authenticated users can insert ai predictions"
  ON public.match_ai_predictions FOR INSERT TO authenticated WITH CHECK (true);

-- Allow upsert (needed for ON CONFLICT)
CREATE POLICY "authenticated users can update ai predictions"
  ON public.match_ai_predictions FOR UPDATE TO authenticated USING (true);
