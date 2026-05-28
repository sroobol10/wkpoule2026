import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

export function formatInAmsterdam(isoString: string, formatStr: string): string {
  const d = new Date(isoString)
  const utc = new Date(new Date(d).toLocaleString('en-US', { timeZone: 'UTC' }))
  const ams = new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
  const shifted = new Date(d.getTime() + (ams.getTime() - utc.getTime()))
  return format(shifted, formatStr, { locale: nl })
}
