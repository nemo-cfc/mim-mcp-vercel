/**
 * Admin user-management endpoints. All require role='admin'.
 *
 *   GET     /api/web/admin/users           list users
 *   POST    /api/web/admin/users           create { email, password, role }
 *   PATCH   /api/web/admin/users           update { email, password?, role? }
 *   DELETE  /api/web/admin/users?email=    delete user
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/web-auth';
import {
  listUsers,
  createUser,
  deleteUser,
  updateUserPassword,
  updateUserRole,
  getUser,
  type UserRole,
} from '@/lib/users';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u) return { ok: false as const, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (u.role !== 'admin')
    return { ok: false as const, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { ok: true as const, user: u };
}

function publicView(u: any) {
  // Strip password fields before returning to client.
  const { password_hash: _ph, salt: _s, ...rest } = u;
  return rest;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const users = await listUsers();
  return NextResponse.json({ users: users.map(publicView) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const role: UserRole = body?.role === 'admin' ? 'admin' : 'user';
  if (!email || !password)
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  try {
    const created = await createUser({ email, password, role });
    return NextResponse.json({ user: publicView(created) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'create failed' }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const email = String(body?.email || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const existing = await getUser(email);
  if (!existing) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 8)
      return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
    await updateUserPassword(email, body.password);
  }
  if (body.role === 'admin' || body.role === 'user') {
    // Prevent demoting the last admin.
    if (body.role === 'user' && existing.role === 'admin') {
      const all = await listUsers();
      const adminCount = all.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1)
        return NextResponse.json(
          { error: 'cannot demote the last admin' },
          { status: 400 }
        );
    }
    await updateUserRole(email, body.role);
  }
  const updated = await getUser(email);
  return NextResponse.json({ user: updated ? publicView(updated) : null });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  // Prevent deleting yourself.
  if (auth.user.email === email)
    return NextResponse.json({ error: 'cannot delete your own account' }, { status: 400 });

  const existing = await getUser(email);
  if (!existing) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // Prevent deleting the last admin.
  if (existing.role === 'admin') {
    const all = await listUsers();
    const adminCount = all.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1)
      return NextResponse.json({ error: 'cannot delete the last admin' }, { status: 400 });
  }

  await deleteUser(email);
  return NextResponse.json({ ok: true });
}
