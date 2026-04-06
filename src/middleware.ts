import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth
    const { pathname } = req.nextUrl

    if (pathname.startsWith('/admin') && token?.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    if (pathname.startsWith('/manager') && token?.role !== 'MANAGER') {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    if (pathname.startsWith('/staff') && token?.role !== 'STAFF') {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // Unauthenticated requests are rejected before the middleware function
      // above even runs.
      authorized: ({ token }) => !!token,
    },
  },
)

export const config = {
  matcher: ['/admin/:path*', '/manager/:path*', '/staff/:path*'],
}
