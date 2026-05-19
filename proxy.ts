import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/registreren', '/poule']

const SKIP = /^\/(\_next|favicon\.ico|worldcup\.jpeg|.*\.[a-z]+$)/

export async function proxy(request: NextRequest) {
  if (SKIP.test(request.nextUrl.pathname)) return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })

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
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  // Vernieuw sessie — wrap in try/catch zodat een netwerk-timeout niet hangt
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // Bij fout: gewoon doorgaan zonder auth-redirect
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

