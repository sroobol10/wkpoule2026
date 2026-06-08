import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { realtime: { transport: ws as any } })

async function main() {
  const { data, error } = await supabase
    .from('matches')
    .select('match_number, stage, kickoff_at')
    .in('stage', ['r32','r16','qf','sf','third_place','final'])
    .order('kickoff_at')

  if (error) { console.error(error.message); process.exit(1) }
  console.log(`KO matches in DB: ${data?.length ?? 0}`)
  for (const m of data ?? []) {
    console.log(`  #${m.match_number} ${m.stage} — ${m.kickoff_at ?? '(geen datum)'}`)
  }
}
main().catch(console.error)
