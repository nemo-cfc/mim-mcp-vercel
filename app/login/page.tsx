'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/web/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || `login failed (${res.status})`);
        setBusy(false);
        return;
      }
      router.push(next);
    } catch (e: any) {
      setError(e?.message || 'network error');
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#fafafa',
        fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif',
        padding: '24px',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 28,
          background: '#fff',
          border: '1px solid #e6e6e6',
          borderRadius: 14,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>MiM Essay Dashboard</h1>
        <p style={{ color: '#666', fontSize: 13, margin: '0 0 18px' }}>Sign in with your email.</p>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={labelStyle}>Email</span>
          <input
            type="email"
            autoComplete="username"
            placeholder="you@mim-essay.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            disabled={busy}
            required
          />
        </label>

        <label style={{ display: 'block' }}>
          <span style={labelStyle}>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            disabled={busy}
            required
          />
        </label>

        {error && (
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              color: '#b42318',
              background: '#fdecec',
              padding: '8px 10px',
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !email.trim() || !password}
          style={{
            marginTop: 14,
            width: '100%',
            padding: '10px 14px',
            background: busy ? '#9aa' : '#111',
            color: '#fff',
            border: 0,
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: '#666',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
