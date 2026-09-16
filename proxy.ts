import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD
  if (!password) return NextResponse.next()

  const username = process.env.SITE_USER || 'lilian'
  const authorization = request.headers.get('authorization')

  if (authorization?.startsWith('Basic ')) {
    try {
      const decoded = atob(authorization.slice(6))
      if (decoded === `${username}:${password}`) return NextResponse.next()
    } catch {
      // En-tête invalide : on redemande les identifiants.
    }
  }

  return new NextResponse('Accès protégé', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Répertoire Cuisine", charset="UTF-8"',
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
