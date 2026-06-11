-- Deelname-vlag: inactieve deelnemers (niet alles ingevuld) worden uit de
-- klassementen gefilterd. Admin zet de vlag handmatig uit voor wie niet meedoet.
ALTER TABLE public.profiles
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
