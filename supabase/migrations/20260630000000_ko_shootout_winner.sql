-- KO-wedstrijden kunnen gelijk eindigen en op strafschoppen beslist worden.
-- Bij een gelijke stand (home_score = away_score) bepaalt shootout_winner_id wie
-- doorgaat. Bij een beslissende score is deze kolom NULL (winnaar = hoogste score).
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS shootout_winner_id UUID REFERENCES public.teams(id);
