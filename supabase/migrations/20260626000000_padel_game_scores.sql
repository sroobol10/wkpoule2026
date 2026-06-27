-- Scores voor de Padel Club mini-games (bv. whack-a-flyer). Gedeeld leaderboard
-- onder de leden; iedereen mag lezen, je voegt alleen je eigen scores toe.
CREATE TABLE IF NOT EXISTS public.padel_game_scores (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game       TEXT        NOT NULL,
  score      INT         NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.padel_game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Padel-scores leesbaar"
  ON public.padel_game_scores FOR SELECT
  USING (true);

CREATE POLICY "Eigen padel-score toevoegen"
  ON public.padel_game_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_padel_game_scores_game_score
  ON public.padel_game_scores (game, score DESC);
