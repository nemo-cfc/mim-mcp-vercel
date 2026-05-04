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
  FocalDayCards,
  TrendChart,
  DailyTrendTable,
  DecayPanel,
  MetaLaneTable,
  TopAdsTable,
  ChannelTable,
  StageDistribution,
  InsightsPanel,
  NotesBanner,
  VolumeHeader,
  VolumeSummaryCards,
  VolumeTrendSVG,
  VolumeMethodologyPanel,
  VolumeChannelTable,
  MofRemartDailyTable,
  TOFAttributionTable,
  RollingChannelTrendTable,
  QualitySummaryCards,
  QualityTrendSVG,
  QualityDefinitionsPanel,
  CPQLCPGLTable,
  QualityChannelTable,
  StageDistributionWithCategories,
  QualityRollingTable,
  QualityInsightsPanel,
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
  searchParams: { from?: string; to?: string; focal?: string; date_field?: string };
}) {
  if (!isAuthed()) redirect('/login');

  // Default: 14-day window ending yesterday, focal = yesterday.
  const now = todayISO();
  const defaultFocal = daysAgo(now, 1);
  const focal = props.searchParams.focal || defaultFocal;
  const to = props.searchParams.to || focal;
  const from = props.searchParams.from || daysAgo(to, 13);
  const dateField: 'created_at' | 'booked_at' =
    props.searchParams.date_field === 'booked_at' ? 'booked_at' : 'created_at';

  let data: any = null;
  let error: string | null = null;
  try {
    data = await buildVolumeReport(
      { from, to },
      {
        focalDate: focal,
        includeDailyTrend: true,
        includeInsights: true,
        dateField,
      }
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
                  {' · grouped by '}
                  <strong>{dateField === 'booked_at' ? 'booked at' : 'created at'}</strong>
                </>
              ) : (
                'Loading…'
              )}
            </p>
          </div>
        </header>

        <DateControls from={from} to={to} focal={focal} dateField={dateField} />

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

            {/* ============================================================
                VOLUME DASHBOARD — matches the canonical Lead Volume skill
            ============================================================ */}
            {data.volume && (
              <>
                <VolumeHeader volume={data.volume} />
                <VolumeSummaryCards volume={data.volume} />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr',
                    gap: 14,
                    alignItems: 'start',
                    marginBottom: 16,
                  }}
                >
                  <VolumeTrendSVG rolling={data.volume.rolling_7d_trend} />
                  <VolumeMethodologyPanel />
                </div>
                <VolumeChannelTable volume={data.volume} />
                <MofRemartDailyTable mof={data.volume.mof_remarketing} />
                <TOFAttributionTable tof={data.volume.tof} />
                <RollingChannelTrendTable rolling={data.volume.rolling_7d_trend} />
              </>
            )}

            {/* ============================================================
                QUALITY DASHBOARD — matches the canonical Lead Quality skill
                Visible only when focal_date is set (data.quality is computed)
            ============================================================ */}
            {data.quality && (
              <>
                <div
                  style={{
                    fontSize: 12,
                    color: '#666',
                    margin: '4px 0 6px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Quality view —{' '}
                  {dateField === 'booked_at' ? 'booked' : 'created'} on {data.focal_date}
                </div>
                <QualitySummaryCards quality={data.quality} />

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr',
                    gap: 14,
                    alignItems: 'start',
                    marginBottom: 16,
                  }}
                >
                  <QualityTrendSVG daily={data.quality.daily_quality} />
                  <QualityDefinitionsPanel />
                </div>

                <QualityChannelTable channels={data.quality.channels} quality={data.quality} />
                <CPQLCPGLTable quality={data.quality} />
                <StageDistributionWithCategories stages={data.stage_distribution} />
                <QualityRollingTable daily={data.quality.daily_quality} />
                <QualityInsightsPanel bullets={data.quality.insight_bullets} />
              </>
            )}

            {/* ============================================================
                VOLUME / SPEND DETAIL — kept below Quality view
            ============================================================ */}
            <div
              style={{
                fontSize: 12,
                color: '#666',
                margin: '24px 0 6px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                borderTop: '1px solid #e6e6e6',
                paddingTop: 24,
              }}
            >
              Volume detail (window {from} to {to})
            </div>

            {/* Focal-day snapshot for spend metrics */}
            {data.focal_date && data.daily_trend?.length > 0 && (
              <FocalDayCards
                focalDate={data.focal_date}
                daily={data.daily_trend}
                dateField={data.date_field || 'created_at'}
              />
            )}

            <div
              style={{
                fontSize: 12,
                color: '#666',
                margin: '4px 0 6px',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Window totals ({from} to {to})
            </div>
            <SummaryCards
              totals={data.totals}
              dateRange={data.date_range}
              focalDate={data.focal_date}
            />

            {data.daily_trend?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <TrendChart daily={data.daily_trend} focalDate={data.focal_date} />
              </div>
            )}
            {data.decay && <DecayPanel decay={data.decay} />}
            {data.insights && <InsightsPanel text={data.insights} />}
            <MetaLaneTable lanes={data.meta_lanes} />
            <TopAdsTable ads={data.top_ads} />
            <ChannelTable channels={data.channels} />
            {data.daily_trend?.length > 0 && (
              <DailyTrendTable daily={data.daily_trend} focalDate={data.focal_date} />
            )}
            {/* Stage distribution: only show here if Quality view didn't show it */}
            {!data.quality && <StageDistribution stages={data.stage_distribution} />}
          </>
        )}

        <footer style={{ color: '#888', fontSize: 11, textAlign: 'center', marginTop: 32 }}>
          MiM Essay MCP · data joined from CRM + Meta Ads + Google Ads
        </footer>
      </div>
    </main>
  );
}
