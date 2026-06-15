/**
 * Qualified-leads-by-ad dashboard.
 *
 * Shows per-ad × per-stage breakdown of CRM leads that passed through
 * "Calls today" qualification gate. For Meta-attributed ads, a "View ad"
 * hyperlink uses the creative's permalink_url (stable Facebook /reel/ or
 * /post URL). A "Refresh preview" action invalidates the cached URL and
 * re-fetches from Meta Graph API in case the cached value is stale.
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/web-auth';
import { buildQualifiedByAdReport } from '@/lib/qualified-by-ad';
import { TopNav } from '../nav';
import { QualifiedByAdTable, DateControls } from './components';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(d: string, n: number): string {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

export default async function QualifiedByAdPage(props: {
  searchParams: { from?: string; to?: string; date_field?: string; refresh?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard/qualified-by-ad');

  // Default: last 7 days ending yesterday (matures qualification signal).
  const now = todayISO();
  const defaultTo = daysAgo(now, 1);
  const defaultFrom = daysAgo(defaultTo, 6);
  const from = props.searchParams.from || defaultFrom;
  const to = props.searchParams.to || defaultTo;
  const dateField: 'created_at' | 'booked_at' =
    props.searchParams.date_field === 'booked_at' ? 'booked_at' : 'created_at';
  const forceRefresh = props.searchParams.refresh === '1';

  let data: any = null;
  let error: string | null = null;
  try {
    data = await buildQualifiedByAdReport({
      from,
      to,
      date_field: dateField,
      force_refresh_previews: forceRefresh,
    });
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
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <TopNav
          current="qualified-by-ad"
          userEmail={user.email}
          isAdmin={user.role === 'admin'}
        />

        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Qualified Leads — by Ad</h1>
          <p style={{ color: '#555', fontSize: 13, margin: '4px 0 0' }}>
            Per-ad × per-stage matrix of leads that passed "Calls today" and are in
            a progression stage (Calls today → School shortlisting → … → Lead won).
            Excludes negative outcomes (Lead lost / No Show / DNP / Deleted).
            {data && (
              <>
                {' · '}Window <strong>{from}</strong> to <strong>{to}</strong>
                {' · '}grouped by <strong>{dateField === 'booked_at' ? 'booked at' : 'created at'}</strong>
              </>
            )}
          </p>
        </header>

        <DateControls
          from={from}
          to={to}
          dateField={dateField}
        />

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

        {data && (
          <>
            <SummaryCards report={data} />
            <QualifiedByAdTable data={data} />
          </>
        )}

        <footer style={{ color: '#888', fontSize: 11, textAlign: 'center', marginTop: 32 }}>
          MiM Essay MCP · qualified = passed "Calls today" per `is_qualified` ·
          Meta preview URLs cached 7 days · Refresh action force-invalidates per row
        </footer>
      </div>
    </main>
  );
}

function SummaryCards(props: { report: any }) {
  const d = props.report;
  const metaRows = d.rows.filter((r: any) => r.is_meta);
  const nonMetaRows = d.rows.filter((r: any) => !r.is_meta && r.ad_id !== '');
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 16,
      }}
    >
      <Card label="Qualified leads (total)" value={String(d.total_qualified)} />
      <Card
        label="Leads in window (all)"
        value={String(d.total_leads_in_window)}
        sub={`${(((d.total_qualified || 0) / Math.max(d.total_leads_in_window, 1)) * 100).toFixed(1)}% qual rate`}
      />
      <Card label="Meta ads with qualified leads" value={String(metaRows.length)} />
      <Card label="Unattributed qualified" value={String(d.unattributed_qualified)} />
    </div>
  );
}

function Card(props: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>{props.label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{props.value}</div>
      {props.sub && (
        <div style={{ marginTop: 4, color: '#444', fontSize: 12 }}>{props.sub}</div>
      )}
    </div>
  );
}
