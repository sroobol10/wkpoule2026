import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/registreren', '/poule']

const SKIP = /^\/(\_next|favicon\.ico|worldcup\.jpeg|.*\.[a-z]+$)/

export async function proxy(request: NextRequest) {
  if (SKIP.test(request.nextUrl.pathname)) return NextResponse.next()

  // Geef pathname door als request-header zodat server components hem kunnen lezen via headers()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  let user = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      // Token refresh mislukt (bijv. race condition met andere tab) —
      // niet uitloggen, laat browser het opnieuw proberen met bijgewerkte cookies.
      if (!isPublic) return supabaseResponse
    } else {
      user = data.user
    }
  } catch {
    // Netwerk-timeout of onverwachte fout — gewoon doorgaan
    return supabaseResponse
  }

  // Niet ingelogd → stuur naar /login (behalve publieke routes)
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Al ingelogd → stuur weg van auth-pagina's
  if (user && (pathname === '/login' || pathname === '/registreren')) {
    return NextResponse.redirect(new URL('/voorspellingen', request.url))
  }

  return supabaseResponse
}

