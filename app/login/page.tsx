'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const [token, setToken] = useState('');
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
        body: JSON.stringify({ token: token.trim() }),
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
        <p style={{ color: '#666', fontSize: 13, margin: '0 0 18px' }}>
          Enter your bearer token to access the dashboard.
        </p>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Bearer token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #ddd',
            borderRadius: 8,
            fontSize: 14,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          disabled={busy}
        />
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
          disabled={busy || !token.trim()}
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
