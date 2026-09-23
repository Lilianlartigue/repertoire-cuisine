import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'rc_session'

async function sessionToken(username: string, password: string) {
  const data = new TextEncoder().encode(`${username}:${password}:repertoire-cuisine-session`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD
  if (!password) return NextResponse.next()

  const username = process.env.SITE_USER || 'lilian'
  const pathname = request.nextUrl.pathname

  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/readonly'
  ) {
    return NextResponse.next()
  }

  const expected = await sessionToken(username, password)
  const current = request.cookies.get(COOKIE_NAME)?.value

  if (current === expected) return NextResponse.next()

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
