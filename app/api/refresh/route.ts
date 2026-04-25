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

  try {
    const result = await refreshLeadCache();
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
