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
  if (user.role !== 'admin') {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', color: '#444' }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Forbidden</h1>
          <p style={{ fontSize: 14 }}>
            Your account ({user.email}) doesn't have admin access.
          </p>
          <a
            href="/dashboard"
            style={{
              display: 'inline-block',
              marginTop: 16,
              padding: '8px 14px',
              background: '#111',
              color: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Go to dashboard
          </a>
        </div>
      </main>
    );
  }

  const users = await listUsers();
  // Strip secrets before passing to the client.
  const safeUsers = users.map(({ password_hash: _ph, salt: _s, ...rest }) => rest);
  return <AdminPanel currentEmail={user.email} initialUsers={safeUsers} />;
}
