'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface UserRow {
  email: string;
  role: 'admin' | 'user';
  created_at: string;
  last_login?: string;
}

export function AdminPanel(props: { currentEmail: string; initialUsers: UserRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [users, setUsers] = useState<UserRow[]>(props.initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New user form state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');

  function flash(kind: 'error' | 'success', msg: string) {
    if (kind === 'error') {
      setError(msg);
      setSuccess(null);
    } else {
      setSuccess(msg);
      setError(null);
    }
    setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 4000);
  }

  async function refresh() {
    const r = await fetch('/api/web/admin/users');
    if (r.ok) {
      const data = await r.json();
      setUsers(data.users);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/web/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail.trim(), password: newPassword, role: newRole }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      flash('error', body.error || `failed (${res.status})`);
      return;
    }
    flash('success', `Created ${newEmail}`);
    setNewEmail('');
    setNewPassword('');
    setNewRole('user');
    refresh();
  }

  async function resetPassword(email: string) {
    const pw = prompt(`New password for ${email} (min 8 chars):`);
    if (!pw || pw.length < 8) {
      if (pw !== null) flash('error', 'password too short');
      return;
    }
    const res = await fetch('/api/web/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw }),
    });
    if (res.ok) flash('success', `Password updated for ${email}`);
    else {
      const body = await res.json().catch(() => ({}));
      flash('error', body.error || 'failed');
    }
  }

  async function toggleRole(email: string, role: 'admin' | 'user') {
    const newR = role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change ${email}'s role to ${newR}?`)) return;
    const res = await fetch('/api/web/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: newR }),
    });
    if (res.ok) {
      flash('success', `${email} is now ${newR}`);
      refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      flash('error', body.error || 'failed');
    }
  }

  async function deleteUser(email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    const res = await fetch(
      `/api/web/admin/users?email=${encodeURIComponent(email)}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      flash('success', `Deleted ${email}`);
      refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      flash('error', body.error || 'failed');
    }
  }

  function logout() {
    fetch('/api/web/auth', { method: 'DELETE' }).then(() => router.push('/login'));
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#fafafa',
        fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif',
        color: '#111',
        padding: 20,
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, margin: 0 }}>Admin · Users</h1>
            <p style={{ color: '#555', fontSize: 13, margin: '4px 0 0' }}>
              Signed in as <strong>{props.currentEmail}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href="/dashboard"
              style={{
                padding: '6px 12px',
                background: '#fafafa',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 13,
                color: '#444',
                textDecoration: 'none',
              }}
            >
              Dashboard
            </a>
            <button
              onClick={logout}
              style={{
                padding: '6px 12px',
                background: '#fafafa',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 13,
                color: '#444',
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        {error && (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              background: '#fdecec',
              color: '#b42318',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              background: '#e9f7ef',
              color: '#16794c',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {success}
          </div>
        )}

        {/* Create user */}
        <section
          style={{
            background: '#fff',
            border: '1px solid #e6e6e6',
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Add user</h2>
          <form
            onSubmit={createUser}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}
          >
            <Field label="Email">
              <input
                type="email"
                placeholder="user@mim-essay.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                style={{ ...inputStyle, width: 240 }}
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                placeholder="min 8 chars"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ ...inputStyle, width: 200 }}
                minLength={8}
                required
              />
            </Field>
            <Field label="Role">
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
                style={{ ...inputStyle, width: 120 }}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </Field>
            <button
              type="submit"
              style={{
                padding: '8px 14px',
                background: '#111',
                color: '#fff',
                border: 0,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Create
            </button>
          </form>
        </section>

        {/* User list */}
        <section
          style={{
            background: '#fff',
            border: '1px solid #e6e6e6',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #eee',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Users ({users.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Created</th>
                <th style={th}>Last Login</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#888' }}>
                    No users yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = u.email === props.currentEmail;
                  return (
                    <tr key={u.email}>
                      <td style={td}>
                        {u.email}
                        {isSelf && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              padding: '2px 6px',
                              borderRadius: 999,
                              background: '#eef',
                              color: '#445',
                            }}
                          >
                            you
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: u.role === 'admin' ? '#fef3c7' : '#eef',
                            color: u.role === 'admin' ? '#92400e' : '#445',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td style={td}>{fmtDate(u.created_at)}</td>
                      <td style={td}>{u.last_login ? fmtDate(u.last_login) : '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button onClick={() => resetPassword(u.email)} style={btnSmall}>
                          Reset password
                        </button>
                        <button
                          onClick={() => toggleRole(u.email, u.role)}
                          style={btnSmall}
                          title={`Make ${u.role === 'admin' ? 'user' : 'admin'}`}
                        >
                          {u.role === 'admin' ? 'Demote' : 'Promote'}
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => deleteUser(u.email)}
                            style={{ ...btnSmall, color: '#b42318' }}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#666', fontWeight: 600, textTransform: 'uppercase' }}>
        {props.label}
      </span>
      {props.children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #ddd',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: 12,
  fontWeight: 700,
  color: '#444',
  background: '#fafafa',
  borderBottom: '1px solid #eee',
};

const td: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 13,
  borderBottom: '1px solid #eee',
};

const btnSmall: React.CSSProperties = {
  padding: '4px 8px',
  marginLeft: 6,
  background: '#fafafa',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 11,
  cursor: 'pointer',
  color: '#333',
};

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
