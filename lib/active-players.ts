import type { SupabaseClient } from '@supabase/supabase-js'

// Alleen actieve deelnemers (profiles.is_active) doen mee in de klassementen.
// De vlag staat standaard aan en wordt door de admin uitgezet voor wie zijn
// voorspellingen niet (compleet) heeft ingevuld.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActivePlayerIds(supabase: SupabaseClient<any, any, any>): Promise<Set<string>> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_active', true)
  return new Set((data ?? []).map((p) => p.id))
}
