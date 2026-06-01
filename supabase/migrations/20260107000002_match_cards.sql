-- Kaartregistratie per wedstrijd per team
-- Gele kaart = 1 pt · Rode kaart = 2 pt (voor Kaartenkoning-bonusvraag)
CREATE TABLE public.match_cards (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     UUID        NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id      UUID        NOT NULL REFERENCES public.teams(id)   ON DELETE CASCADE,
  yellow_cards SMALLINT    NOT NULL DEFAULT 0 CHECK (yellow_cards >= 0),
  red_cards    SMALLINT    NOT NULL DEFAULT 0 CHECK (red_cards    >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, team_id)
);

CREATE INDEX idx_match_cards_match ON public.match_cards(match_id);
CREATE INDEX idx_match_cards_team  ON public.match_cards(team_id);

ALTER TABLE public.match_cards ENABLE ROW LEVEL SECURITY;

-- Iedereen kan kaarten inzien (openbare data)
CREATE POLICY "Iedereen ziet kaarten"
  ON public.match_cards FOR SELECT USING (true);
