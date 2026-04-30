import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/web-auth';

/**
 * Protect /dashboard. The actual token comparison is done in lib/web-auth.ts
 * (server components / API routes). Middleware only checks for *presence*
 * of the auth cookie — if missing, redirect to /login. Pages double-check
 * the value via isAuthed().
 *
 * /api/* is left to its own auth (the MCP route already verifies bearer
 * tokens, the web/auth login endpoint is intentionally open).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Allow login page + login API + assets through.
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/web/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Only gate /dashboard for now (landing page stays public).
  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE_NAME);
  if (cookie?.value) return NextResponse.next();

  // Redirect to /login with the original path so we can come back after.
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  if (pathname !== '/dashboard' || search) {
    loginUrl.searchParams.set('next', pathname + search);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
