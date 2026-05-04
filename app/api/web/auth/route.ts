/**
 * Login / logout endpoint for the webapp.
 *   POST   { email, password }  -> validate, set session cookie
 *   DELETE                       -> clear session
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getUser,
  verifyPassword,
  createSession,
  deleteSession,
  buildSessionCookie,
  maybeBootstrapAdmin,
  touchLastLogin,
  SESSION_COOKIE_NAME,
} from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: 'email and password required' }, { status: 400 });
  }

  // Bootstrap path: if no users yet and creds match ADMIN_EMAIL/ADMIN_PASSWORD,
  // auto-create the admin record on first login.
  let user = await getUser(email);
  if (!user) {
    const created = await maybeBootstrapAdmin(email, password);
    if (created) user = created;
  }

  if (!user) {
    return NextResponse.json({ ok: false, error: 'invalid credentials' }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.password_hash, user.salt);
  if (!ok) {
    return NextResponse.json({ ok: false, error: 'invalid credentials' }, { status: 401 });
  }

  await touchLastLogin(user.email);
  const sid = await createSession(user.email);
  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(buildSessionCookie(sid));
  return res;
}

export async function DELETE() {
  const c = cookies().get(SESSION_COOKIE_NAME);
  if (c?.value) await deleteSession(c.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
  });
  return res;
}
