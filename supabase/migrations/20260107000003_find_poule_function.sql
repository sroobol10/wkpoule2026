-- Hulpfunctie: poule opzoeken via uitnodigingscode
-- Draait met SECURITY DEFINER zodat RLS omzeild wordt —
-- de gewone anon/user-client kan dit aanroepen zonder service role key.
CREATE OR REPLACE FUNCTION public.find_poule_by_invite_code(invite_code_param TEXT)
RETURNS TABLE(id UUID, name TEXT, is_general BOOLEAN)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  SELECT id, name, is_general
  FROM public.poules
  WHERE invite_code = upper(trim(invite_code_param))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_poule_by_invite_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_poule_by_invite_code(TEXT) TO anon;
