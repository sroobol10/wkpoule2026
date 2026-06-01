-- Rangswijziging bijhouden op de klassementsrij
-- rank_change > 0 = gestegen, < 0 = gedaald, 0 = gelijk, NULL = eerste keer
ALTER TABLE public.poule_scores
  ADD COLUMN IF NOT EXISTS rank_change INT DEFAULT NULL;
