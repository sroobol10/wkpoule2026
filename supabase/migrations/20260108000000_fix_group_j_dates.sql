-- Correctie aanvangstijden laatste groepswedstrijden van groep J
-- Waren 2026-06-29T02:00:00Z (04:00 CEST jun 29), moeten 28 juni zijn
UPDATE public.matches SET kickoff_at = '2026-06-28T21:00:00Z'
WHERE match_number IN (69, 70);
