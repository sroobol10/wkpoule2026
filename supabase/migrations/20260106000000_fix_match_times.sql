-- Correctie aanvangstijd openingswedstrijd (wedstrijd #1: Mexico – Zuid-Afrika)
-- Correcte tijd: 11 juni 2026 21:00 Amsterdam (CEST) = 19:00 UTC
UPDATE public.matches
SET kickoff_at = '2026-06-11T19:00:00Z'
WHERE match_number = 1;
