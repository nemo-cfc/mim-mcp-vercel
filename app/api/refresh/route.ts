/**
 * Cron refresh endpoint.
 * Vercel Cron hits this every 30 minutes (configured in vercel.json).
 * Re-fetches all MiM Essay CRM leads and stores them in Redis.
 */
import { NextResponse } from 'next/server';
import { verifyCron } from '@/lib/auth';
import { refreshLeadCache } from '@/lib/mim-essay-api';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = verifyCron(req);
  if (!auth.ok) return auth.response;

  // Optional ?days=N to override the default 90-day window.
  // Pass ?days=0 (or large like 3650) to force a full historical load.
  let days: number | null | undefined = undefined;
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('days');
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) days = n === 0 ? null : n;
    }
  } catch {
    // ignore URL parse errors
  }

  try {
    const result = await refreshLeadCache(days === undefined ? undefined : { days });
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[refresh] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'unknown error' },
      { status: 500 }
    );
  }
}

export const POST = GET;
