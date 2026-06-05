'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type SaveResult = { ok: true } | { ok: false; error: string }

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function createPoule(
  _: unknown,
  formData: FormData
): Promise<{ ok: false; error: string } | { ok: true; id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  const name = (formData.get('name') as string | null)?.trim()
  if (!name || name.length < 2) return { ok: false, error: 'Naam moet minimaal 2 tekens zijn.' }
  if (name.length > 50) return { ok: false, error: 'Naam mag maximaal 50 tekens zijn.' }

  const invite_code = generateCode()
  const poule_id = crypto.randomUUID()

  const { error } = await supabase
    .from('poules')
    .insert({ id: poule_id, name, invite_code, creator_id: user.id, is_general: false })

  if (error) return { ok: false, error: 'Aanmaken mislukt.' }

  await supabase.from('poule_members').insert({ poule_id, user_id: user.id })

  revalidatePath('/poules')
  redirect(`/poules/${poule_id}`)
}

export async function deletePoule(pouleId: string): Promise<SaveResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  // Controleer eigenaarschap en dat het geen algemene poule is
  const { data: poule } = await supabase
    .from('poules')
    .select('id, creator_id, is_general')
    .eq('id', pouleId)
    .single()

  if (!poule) return { ok: false, error: 'Poule niet gevonden.' }
  if (poule.is_general) return { ok: false, error: 'De algemene poule kan niet worden verwijderd.' }
  if (poule.creator_id !== user.id) return { ok: false, error: 'Alleen de eigenaar kan de poule verwijderen.' }

  const { error } = await supabase.from('poules').delete().eq('id', pouleId)
  if (error) return { ok: false, error: 'Verwijderen mislukt.' }

  revalidatePath('/poules')
  return { ok: true }
}

export async function joinPoule(inviteCode: string): Promise<{ ok: true; pouleId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  const code = inviteCode.trim().toUpperCase()

  // SECURITY DEFINER-functie omzeilt RLS voor de lookup (geen service key nodig)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: fnErr } = await (supabase as any)
    .rpc('find_poule_by_invite_code', { invite_code_param: code })

  if (fnErr) return { ok: false, error: `Fout bij opzoeken: ${fnErr.message}` }

  type PouleRow = { id: string; name: string; is_general: boolean }
  const poule = (rows as PouleRow[] | null)?.[0] ?? null
  if (!poule) return { ok: false, error: 'Ongeldige uitnodigingscode.' }

  // Member-check: RLS blokkeert SELECT voor niet-leden → maybeSingle geeft null → correct
  const { data: existing } = await supabase
    .from('poule_members')
    .select('id')
    .eq('poule_id', poule.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return { ok: false, error: 'Je bent al lid van deze poule.' }

  // INSERT: RLS-policy staat dit toe (user_id = auth.uid())
  const { error: insertErr } = await supabase
    .from('poule_members')
    .insert({ poule_id: poule.id, user_id: user.id })

  if (insertErr) return { ok: false, error: `Deelnemen mislukt: ${insertErr.message}` }

  // Zorg dat de nieuwe deelnemer direct in het klassement verschijnt
  await supabase
    .from('poule_scores')
    .upsert(
      { poule_id: poule.id, user_id: user.id, total_pts: 0, exact_hits: 0, correct_results: 0 },
      { onConflict: 'poule_id,user_id' }
    )

  revalidatePath('/poules')
  return { ok: true, pouleId: poule.id }
}
