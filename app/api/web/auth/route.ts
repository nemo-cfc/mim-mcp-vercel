/**
 * Login endpoint for the webapp.
 * POST { token: "<MCP_BEARER_TOKEN>" }  -> sets httpOnly cookie
 * DELETE                                 -> clears cookie (logout)
 */
import { NextResponse } from 'next/server';
import { buildAuthCookie, checkToken, AUTH_COOKIE_NAME } from '@/lib/web-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const token = String(body?.token || '').trim();
  if (!token || !checkToken(token)) {
    return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(buildAuthCookie(token));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
  });
  return res;
}
