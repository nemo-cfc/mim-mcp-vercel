import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'mim_dashboard_session';

/**
 * Gate /dashboard and /admin behind a session cookie. Actual user lookup +
 * role check happens server-side in the page/route handler (we can't use
 * Redis from middleware without bringing the full client into Edge runtime).
 *
 * /api/web/auth and /login stay open. /api/mcp keeps its bearer-token auth.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Public paths.
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/web/auth') ||
    pathname.startsWith('/api/web/auth-status') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Only gate /dashboard and /admin.
  if (!pathname.startsWith('/dashboard') && !pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (cookie?.value) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  if (pathname !== '/dashboard' || search) {
    loginUrl.searchParams.set('next', pathname + search);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
