'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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

export async function joinPoule(inviteCode: string): Promise<SaveResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  const code = inviteCode.trim().toUpperCase()

  // Service-client: omzeilt RLS zodat niet-leden de poule kunnen opzoeken
  const db = createServiceClient()
  const { data: poule, error: pouleErr } = await db
    .from('poules')
    .select('id, name, is_general')
    .eq('invite_code', code)
    .maybeSingle()

  if (pouleErr) return { ok: false, error: `Fout bij opzoeken: ${pouleErr.message}` }
  if (!poule)   return { ok: false, error: 'Ongeldige uitnodigingscode.' }

  // Check al lid — service-client zodat RLS de query niet blokkeert
  const { data: existing } = await db
    .from('poule_members')
    .select('id')
    .eq('poule_id', poule.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return { ok: false, error: 'Je bent al lid van deze poule.' }

  // Inschrijven — service-client zodat de insert niet door RLS wordt geblokkeerd
  const { error: insertErr } = await db
    .from('poule_members')
    .insert({ poule_id: poule.id, user_id: user.id })

  if (insertErr) return { ok: false, error: `Deelnemen mislukt: ${insertErr.message}` }

  // Voeg ook toe aan poule_scores zodat het klassement direct klopt
  await db
    .from('poule_scores')
    .upsert(
      { poule_id: poule.id, user_id: user.id, total_pts: 0, exact_hits: 0, correct_results: 0 },
      { onConflict: 'poule_id,user_id' }
    )

  revalidatePath('/poules')
  return { ok: true }
}
