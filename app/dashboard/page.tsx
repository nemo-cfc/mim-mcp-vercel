/**
 * Main dashboard page (Server Component).
 * Fetches the combined dashboard data on the server, then renders sections.
 * Auth is handled by middleware.ts (cookie check) — this page also double-
 * checks via isAuthed() to avoid an unauthenticated render path.
 */
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/web-auth';
import { buildVolumeReport } from '@/lib/reports';
import {
  DateControls,
  SummaryCards,
  TrendChart,
  DecayPanel,
  MetaLaneTable,
  TopAdsTable,
  ChannelTable,
  StageDistribution,
  InsightsPanel,
  NotesBanner,
} from './components';

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

export default async function DashboardPage(props: {
  searchParams: { from?: string; to?: string; focal?: string };
}) {
  if (!isAuthed()) redirect('/login');

  // Default: 14-day window ending yesterday, focal = yesterday.
  const now = todayISO();
  const defaultFocal = daysAgo(now, 1);
  const focal = props.searchParams.focal || defaultFocal;
  const to = props.searchParams.to || focal;
  const from = props.searchParams.from || daysAgo(to, 13);

  let data: any = null;
  let error: string | null = null;
  try {
    data = await buildVolumeReport(
      { from, to },
      { focalDate: focal, includeDailyTrend: true, includeInsights: true }
    );
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
        padding: '20px',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, margin: 0 }}>MiM Essay marketing dashboard</h1>
            <p style={{ color: '#555', fontSize: 13, margin: '4px 0 0' }}>
              {data ? (
                <>
                  Window <strong>{from}</strong> to <strong>{to}</strong>
                  {focal && <> · focal <strong>{focal}</strong></>}
                </>
              ) : (
                'Loading…'
              )}
            </p>
          </div>
        </header>

        <DateControls from={from} to={to} focal={focal} />

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
            {data.notes?.length > 0 && <NotesBanner notes={data.notes} />}
            <SummaryCards
              totals={data.totals}
              dateRange={data.date_range}
              focalDate={data.focal_date}
            />
            {data.daily_trend?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <TrendChart daily={data.daily_trend} />
              </div>
            )}
            {data.decay && <DecayPanel decay={data.decay} />}
            {data.insights && <InsightsPanel text={data.insights} />}
            <MetaLaneTable lanes={data.meta_lanes} />
            <TopAdsTable ads={data.top_ads} />
            <ChannelTable channels={data.channels} />
            <StageDistribution stages={data.stage_distribution} />
          </>
        )}

        <footer style={{ color: '#888', fontSize: 11, textAlign: 'center', marginTop: 32 }}>
          MiM Essay MCP · data joined from CRM + Meta Ads + Google Ads
        </footer>
      </div>
    </main>
  );
}
