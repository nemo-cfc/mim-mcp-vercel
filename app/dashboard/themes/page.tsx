/**
 * Themes panel — active vs inactive ads per theme based on recent spend.
 *
 * Defaults to a 4-hour spend window in IST. Override via ?hours=8 or any
 * 1..24 value. Override the calendar day via ?date=YYYY-MM-DD.
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/web-auth';
import { buildThemesPanel } from '@/lib/themes-report';
import { TopNav } from '../nav';
import { ThemesPanel } from './components';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function ThemesPage(props: {
  searchParams: { hours?: string; date?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard/themes');

  const hours = (() => {
    const raw = parseInt(props.searchParams.hours || '4', 10);
    if (!Number.isFinite(raw)) return 4;
    return Math.max(1, Math.min(24, raw));
  })();
  const date = props.searchParams.date;

  let data: any = null;
  let error: string | null = null;
  try {
    data = await buildThemesPanel({ hours, date });
  } catch (e: any) {
    error = e?.message || 'unknown';
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
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TopNav current="themes" userEmail={user.email} isAdmin={user.role === 'admin'} />

        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Themes — active ads right now</h1>
          {data && (
            <p style={{ color: '#555', fontSize: 13, margin: '4px 0 0' }}>
              Window: last <strong>{data.window_hours}h</strong> of <strong>{data.date}</strong>{' '}
              (IST) · hours{' '}
              <strong>
                {data.included_hours[0]}-{data.included_hours[data.included_hours.length - 1]}
              </strong>{' '}
              · current hour <strong>{data.current_hour}</strong>
            </p>
          )}
        </header>

        {error && (
          <div
            style={{
              padding: 12,
              background: '#fdecec',
              border: '1px solid #fcc',
              borderRadius: 10,
              color: '#b42318',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {data && <ThemesPanel data={data} />}

        <footer style={{ color: '#888', fontSize: 11, textAlign: 'center', marginTop: 32 }}>
          MiM Essay MCP · themes inferred from ad names · spend pulled from Meta Graph (hourly)
        </footer>
      </div>
    </main>
  );
}
