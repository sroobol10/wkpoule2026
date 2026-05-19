-- ============================================================
-- WK Poule 2026 — Bracket Predictions (pre-tournament bracket)
-- ============================================================
-- Run this migration in your Supabase project dashboard or via
-- `supabase db push` before deploying the bracket feature.

CREATE TABLE public.bracket_predictions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot              INT         NOT NULL,  -- match slot number 73-104
  predicted_team_id UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slot)
);

CREATE INDEX idx_bracket_predictions_user ON public.bracket_predictions(user_id);

ALTER TABLE public.bracket_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own bracket predictions"
  ON public.bracket_predictions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
