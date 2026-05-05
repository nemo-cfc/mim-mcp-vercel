/**
 * Admin panel — user management.
 * Server Component. Auth + role enforced via lib/web-auth.
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/web-auth';
import { listUsers } from '@/lib/users';
import { AdminPanel } from './components';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin');
  // Non-admins quietly land on the dashboard. No "Forbidden" wall — most
  // users hit /admin by accident (stale link, autocompleted URL).
  if (user.role !== 'admin') redirect('/dashboard');

  const users = await listUsers();
  // Strip secrets before passing to the client.
  const safeUsers = users.map(({ password_hash: _ph, salt: _s, ...rest }) => rest);
  return <AdminPanel currentEmail={user.email} initialUsers={safeUsers} />;
}
