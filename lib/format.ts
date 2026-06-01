const MONTH_LONG: Record<number, string> = {
  1:'januari', 2:'februari', 3:'maart', 4:'april', 5:'mei', 6:'juni',
  7:'juli', 8:'augustus', 9:'september', 10:'oktober', 11:'november', 12:'december',
}
const MONTH_SHORT: Record<number, string> = {
  1:'jan', 2:'feb', 3:'mrt', 4:'apr', 5:'mei', 6:'jun',
  7:'jul', 8:'aug', 9:'sep', 10:'okt', 11:'nov', 12:'dec',
}

/**
 * Formatteert een UTC ISO-string in de Amsterdam-tijdzone.
 * Ondersteunde tokens: EEEE yyyy MMMM MMM MM dd d HH mm
 * Werkt correct in zowel server-runtime (UTC) als browser (CEST/CET).
 */
export function formatInAmsterdam(isoString: string, formatStr: string): string {
  const d = new Date(isoString)

  const parts = new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    year:    'numeric',
    month:   '2-digit',
    day:     '2-digit',
    weekday: 'long',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  false,
  }).formatToParts(d)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''

  const year    = get('year')                        // '2026'
  const month   = get('month')                       // '06'
  const day     = get('day')                         // '11'
  const weekday = get('weekday')                     // 'donderdag'
  const hour    = get('hour').replace('24', '00').padStart(2, '0')  // '21'
  const minute  = get('minute').padStart(2, '0')     // '00'

  const monthNum = parseInt(month, 10)
  const dayNum   = parseInt(day, 10)

  // Vervang tokens in één pass via regex (langere patronen eerst, zodat MMMM vóór MMM matcht)
  return formatStr.replace(/EEEE|MMMM|MMM|MM|yyyy|dd|d|HH|mm/g, (token) => {
    switch (token) {
      case 'EEEE': return weekday
      case 'MMMM': return MONTH_LONG[monthNum]  ?? month
      case 'MMM':  return MONTH_SHORT[monthNum] ?? month
      case 'MM':   return month
      case 'yyyy': return year
      case 'dd':   return day
      case 'd':    return String(dayNum)
      case 'HH':   return hour
      case 'mm':   return minute
      default:     return token
    }
  })
}
