import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfielClient from './profiel-client'

export default async function ProfielPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, email, avatar_url, created_at, theme')
    .eq('id', user.id)
    .single()

  // Fetch score from algemene poule
  const { data: generalPoule } = await supabase
    .from('poules')
    .select('id')
    .eq('is_general', true)
    .single()

  const { data: score } = generalPoule
    ? await supabase
        .from('poule_scores')
        .select('total_pts, exact_hits, correct_results')
        .eq('poule_id', generalPoule.id)
        .eq('user_id', user.id)
        .single()
    : { data: null }

  // Count predictions made
  const { count: predCount } = await supabase
    .from('predictions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  // Count bonus answers
  const { count: bonusCount } = await supabase
    .from('bonus_answers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  return (
    <ProfielClient
      profile={profile ?? { id: user.id, username: user.email ?? '', email: user.email ?? '', avatar_url: null, created_at: '' }}
      score={score ?? null}
      predCount={predCount ?? 0}
      bonusCount={bonusCount ?? 0}
      currentTheme={profile?.theme ?? 'default'}
    />
  )
}
