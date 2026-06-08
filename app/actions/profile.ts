'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ProfileResult = { ok: true } | { ok: false; error: string }

export async function setTheme(theme: 'default' | 'retro-1988' | 'oostenrijk'): Promise<ProfileResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  const { error } = await supabase
    .from('profiles')
    .update({ theme })
    .eq('id', user.id)

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  revalidatePath('/', 'layout')
  return { ok: true }
}
