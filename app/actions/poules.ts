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

  // Add creator as member
  await supabase.from('poule_members').insert({ poule_id, user_id: user.id })

  revalidatePath('/poules')
  redirect(`/poules/${poule_id}`)
}

export async function joinPoule(inviteCode: string): Promise<SaveResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  const code = inviteCode.trim().toUpperCase()

  // Gebruik service-client: RLS blokkeert anders de lookup voor niet-leden
  const db = createServiceClient()
  const { data: poule } = await db
    .from('poules')
    .select('id, name, is_general')
    .eq('invite_code', code)
    .single()

  if (!poule) return { ok: false, error: 'Ongeldige uitnodigingscode.' }

  // Check already member
  const { data: existing } = await supabase
    .from('poule_members')
    .select('id')
    .eq('poule_id', poule.id)
    .eq('user_id', user.id)
    .single()

  if (existing) return { ok: false, error: 'Je bent al lid van deze poule.' }

  const { error } = await supabase
    .from('poule_members')
    .insert({ poule_id: poule.id, user_id: user.id })

  if (error) return { ok: false, error: 'Deelnemen mislukt.' }

  revalidatePath('/poules')
  return { ok: true }
}
