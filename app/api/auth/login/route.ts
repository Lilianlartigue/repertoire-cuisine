import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const COOKIE_NAME = 'rc_session'
const THIRTY_DAYS = 60 * 60 * 24 * 30

function sessionToken(username: string, password: string) {
  return require('crypto')
    .createHash('sha256')
    .update(`${username}:${password}:repertoire-cuisine-session`)
    .digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const { username, password, next } = await request.json()
    const expectedUser = process.env.SITE_USER || 'lilian'
    const expectedPassword = process.env.SITE_PASSWORD

    if (!expectedPassword) {
      return NextResponse.json({ ok: true, next: next || '/' })
    }

    if (username !== expectedUser || password !== expectedPassword) {
      return NextResponse.json({ error: 'Identifiants incorrects.' }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true, next: typeof next === 'string' && next.startsWith('/') ? next : '/' })
    response.cookies.set(COOKIE_NAME, sessionToken(expectedUser, expectedPassword), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: THIRTY_DAYS,
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Connexion impossible.' }, { status: 400 })
  }
}
