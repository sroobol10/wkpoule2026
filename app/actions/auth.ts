'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AuthState = { error: string } | null

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()

  const email    = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: 'Ongeldig e-mailadres of wachtwoord.' }

  revalidatePath('/', 'layout')
  redirect('/voorspellingen')
}

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const confirm  = formData.get('confirm') as string
  const username = formData.get('username') as string

  if (password !== confirm) return { error: 'Wachtwoorden komen niet overeen.' }
  if (username.length < 3)  return { error: 'Gebruikersnaam moet minimaal 3 tekens zijn.' }

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (existing) return { error: 'Deze gebruikersnaam is al in gebruik.' }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  })

  if (error) {
    if (error.message.includes('already registered')) return { error: 'Dit e-mailadres is al geregistreerd.' }
    return { error: 'Registratie mislukt. Probeer het opnieuw.' }
  }

  revalidatePath('/', 'layout')
  redirect('/voorspellingen')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
