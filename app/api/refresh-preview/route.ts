/**
 * POST /api/refresh-preview
 *
 * Body: { ad_id: string }
 *
 * Invalidates the cached Meta ad preview URL for the given ad_id and
 * re-fetches it from Graph API. Used by the Qualified-by-ad dashboard's
 * per-row 🔄 button.
 *
 * Returns { ad_id, permalink_url, ad_name, thumbnail_url, fetched_at }.
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/web-auth';
import { getMetaAdPreviewUrls, invalidateAdPreviewCache } from '@/lib/meta-graph';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const adId = String(body?.ad_id || '').trim();
  if (!adId || !/^\d+$/.test(adId)) {
    return NextResponse.json({ error: 'ad_id must be a numeric string' }, { status: 400 });
  }

  try {
    // 1. Invalidate
    await invalidateAdPreviewCache(adId);

    // 2. Re-fetch (force_refresh ensures we don't hit any in-memory cache)
    const result = await getMetaAdPreviewUrls([adId], { force_refresh: true });
    const info = result[adId];
    if (!info) {
      return NextResponse.json({ error: 'failed to fetch preview' }, { status: 502 });
    }
    return NextResponse.json(info);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
