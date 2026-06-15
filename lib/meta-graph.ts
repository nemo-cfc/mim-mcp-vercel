/**
 * Direct Meta Graph API client (bypasses Pipeboard).
 *
 * We were going through Pipeboard's MCP wrapper for Meta Ads insights, but
 * Pipeboard's Facebook connection has gone stale twice now (May 2: token
 * expired; May 4: connection dropped entirely, requiring re-OAuth on their
 * side). The fix is to just call Graph API directly with the user's own
 * long-lived META_ACCESS_TOKEN — no third-party in the path.
 *
 * Graph API endpoint: https://graph.facebook.com/v21.0/{account_id}/insights
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 */
import axios from 'axios';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function getAccessToken(override?: string): string {
  const t = override || process.env.META_ACCESS_TOKEN;
  if (!t) {
    throw new Error(
      'META_ACCESS_TOKEN not set. Get a token from https://developers.facebook.com/tools/explorer/'
    );
  }
  return t;
}

export interface MetaGraphInsightRow {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string | number;
  impressions?: string | number;
  reach?: string | number;
  clicks?: string | number;
  frequency?: string | number;
  cpm?: string | number;
  ctr?: string | number;
  date_start?: string;
  date_stop?: string;
  actions?: Array<{ action_type: string; value: string | number }>;
  [key: string]: any;
}

interface FetchOpts {
  from: string; // YYYY-MM-DD
  to: string;
  level?: 'ad' | 'adset' | 'campaign' | 'account';
  account_id?: string;
  /** Set to true to break the response down by day (Graph API: time_increment=1). */
  daily?: boolean;
  /** How many rows per request (max 500 per Graph API). */
  page_size?: number;
  access_token?: string;
}

const DEFAULT_FIELDS = [
  'ad_id',
  'ad_name',
  'adset_id',
  'adset_name',
  'campaign_id',
  'campaign_name',
  'spend',
  'impressions',
  'reach',
  'clicks',
  'frequency',
  'cpm',
  'ctr',
  'actions',
  'date_start',
  'date_stop',
].join(',');

const ACCOUNT_LEVEL_FIELDS = [
  'spend',
  'impressions',
  'reach',
  'clicks',
  'frequency',
  'cpm',
  'ctr',
  'actions',
  'date_start',
  'date_stop',
].join(',');

/**
 * Fetch Meta Ads insights at any level for a date range. Paginates through
 * Graph API's `paging.next` cursor automatically.
 */
export async function fetchMetaInsights(opts: FetchOpts): Promise<MetaGraphInsightRow[]> {
  const accountId = opts.account_id || process.env.META_AD_ACCOUNT_ID || 'act_509761434701737';
  const token = getAccessToken(opts.access_token);
  const level = opts.level || 'ad';
  const fields = level === 'account' ? ACCOUNT_LEVEL_FIELDS : DEFAULT_FIELDS;
  const limit = opts.page_size ?? 500;

  let url: string | null =
    `${GRAPH_BASE}/${accountId}/insights?` +
    `access_token=${encodeURIComponent(token)}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since: opts.from, until: opts.to }))}` +
    `&level=${level}` +
    `&fields=${fields}` +
    `&limit=${limit}` +
    (opts.daily ? '&time_increment=1' : '');

  const all: MetaGraphInsightRow[] = [];
  let safety = 50; // pagination safety cap
  while (url && safety-- > 0) {
    let res;
    try {
      res = await axios.get(url, { timeout: 30000 });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.error?.message || err?.message;
      throw new Error(`Meta Graph API ${status || ''}: ${detail}`);
    }
    const rows = res.data?.data;
    if (Array.isArray(rows)) all.push(...rows);
    url = res.data?.paging?.next || null;
  }
  return all;
}

/**
 * Batch-fetch Meta status for a list of ad IDs.
 *
 * Returns a map: ad_id → { effective_status, configured_status, name }.
 *
 *   effective_status   actual delivery state, accounting for parent-level
 *                      pauses. ACTIVE means the ad is delivering. Common
 *                      values: ACTIVE, PAUSED, DELETED, ARCHIVED,
 *                      CAMPAIGN_PAUSED, ADSET_PAUSED, IN_PROCESS,
 *                      WITH_ISSUES, PENDING_REVIEW, DISAPPROVED.
 *   configured_status  the ad-level setting only (ignores parent pauses).
 *
 * Used to filter kill-candidate recommendations to ads that are still
 * delivering — so we don't recommend pausing something that's already
 * paused. Meta's batch endpoint accepts up to 50 IDs per request.
 */
export async function getMetaAdStatuses(
  adIds: string[],
  accessToken?: string
): Promise<
  Record<string, { effective_status: string; configured_status: string; name: string }>
> {
  const ids = adIds.filter((id) => Boolean(id) && /^\d+$/.test(id));
  if (ids.length === 0) return {};
  const token = getAccessToken(accessToken);
  const result: Record<string, any> = {};
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const url =
      `${GRAPH_BASE}/?` +
      `ids=${chunk.join(',')}` +
      `&fields=id,name,effective_status,configured_status` +
      `&access_token=${encodeURIComponent(token)}`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      Object.assign(result, res.data || {});
    } catch (err: any) {
      // Don't fail the whole report if one chunk errors — just log and continue.
      console.warn(
        '[meta-graph] getMetaAdStatuses chunk failed:',
        err?.response?.data?.error?.message || err?.message
      );
    }
  }
  // Normalize to the documented shape (Graph sometimes returns extra fields).
  const out: Record<string, { effective_status: string; configured_status: string; name: string }> = {};
  for (const [id, row] of Object.entries(result)) {
    const r = row as any;
    out[id] = {
      effective_status: String(r?.effective_status || 'UNKNOWN'),
      configured_status: String(r?.configured_status || 'UNKNOWN'),
      name: String(r?.name || ''),
    };
  }
  return out;
}

/**
 * Per-ad spend breakdown for a date range.
 * Mirrors the shape Pipeboard's `getMetaSpendByAd` returned, so callers
 * downstream can keep their existing field names.
 */
export async function getMetaSpendByAdDirect(
  from: string,
  to: string,
  metaAccessToken?: string
) {
  const rows = await fetchMetaInsights({
    from,
    to,
    level: 'ad',
    access_token: metaAccessToken,
  });
  return rows.map((r) => ({
    ad_id: String(r.ad_id || ''),
    ad_name: String(r.ad_name || ''),
    campaign_id: String(r.campaign_id || ''),
    campaign_name: String(r.campaign_name || ''),
    adset_id: String(r.adset_id || ''),
    adset_name: String(r.adset_name || ''),
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    reach: Number(r.reach || 0),
    clicks: Number(r.clicks || 0),
    frequency: Number(r.frequency || 0),
    cpm: Number(r.cpm || 0),
    ctr: Number(r.ctr || 0),
  }));
}

/**
 * Per-ad spend with an hourly breakdown for a single date. Used by the
 * Themes panel to detect which ads spent money in the last N hours
 * (proxy for "actively delivering right now").
 *
 * Returns one row per (ad_id, hour_bin). The `hour` field is 0-23.
 *
 * Meta API:
 *   breakdowns=hourly_stats_aggregated_by_advertiser_time_zone
 *   returns a string like "00:00:00 - 00:59:59" — we parse the leading
 *   hour into an integer.
 */
export async function getMetaAdsHourlySpend(opts: {
  date: string; // YYYY-MM-DD (account timezone)
  access_token?: string;
  account_id?: string;
}): Promise<
  Array<{
    ad_id: string;
    ad_name: string;
    campaign_id: string;
    campaign_name: string;
    hour: number;
    spend: number;
    impressions: number;
  }>
> {
  const accountId = opts.account_id || process.env.META_AD_ACCOUNT_ID || 'act_509761434701737';
  const token = getAccessToken(opts.access_token);
  const fields = [
    'ad_id',
    'ad_name',
    'campaign_id',
    'campaign_name',
    'spend',
    'impressions',
  ].join(',');

  let url: string | null =
    `${GRAPH_BASE}/${accountId}/insights?` +
    `access_token=${encodeURIComponent(token)}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since: opts.date, until: opts.date }))}` +
    `&level=ad` +
    `&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone` +
    `&fields=${fields}` +
    `&limit=500`;

  const rows: Array<{
    ad_id: string;
    ad_name: string;
    campaign_id: string;
    campaign_name: string;
    hour: number;
    spend: number;
    impressions: number;
  }> = [];
  let safety = 50;
  while (url && safety-- > 0) {
    let res;
    try {
      res = await axios.get(url, { timeout: 30000 });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.error?.message || err?.message;
      throw new Error(`Meta Graph API ${status || ''} (hourly): ${detail}`);
    }
    const data: any[] = res.data?.data || [];
    for (const r of data) {
      // hourly_stats_aggregated_by_advertiser_time_zone looks like "00:00:00 - 00:59:59"
      const hourRaw = String(r.hourly_stats_aggregated_by_advertiser_time_zone || '');
      const m = hourRaw.match(/^(\d{2}):/);
      const hour = m ? parseInt(m[1], 10) : NaN;
      if (!Number.isFinite(hour)) continue;
      rows.push({
        ad_id: String(r.ad_id || ''),
        ad_name: String(r.ad_name || ''),
        campaign_id: String(r.campaign_id || ''),
        campaign_name: String(r.campaign_name || ''),
        hour,
        spend: Number(r.spend || 0),
        impressions: Number(r.impressions || 0),
      });
    }
    url = res.data?.paging?.next || null;
  }
  return rows;
}

/**
 * Account-level daily breakdown — mirrors what reports.ts uses for the
 * daily-trend chart and decay metrics.
 */
export async function getMetaDailyAccount(
  from: string,
  to: string,
  metaAccessToken?: string
): Promise<MetaGraphInsightRow[]> {
  return fetchMetaInsights({
    from,
    to,
    level: 'account',
    daily: true,
    access_token: metaAccessToken,
  });
}

// ============================================================================
// AD PREVIEW URLS — used by /dashboard/qualified-by-ad
// ============================================================================
//
// For each ad we expose a "View ad" link in the dashboard. Three sources, in
// order of preference:
//   1. creative.permalink_url — stable Facebook /reel/<vid>/ or /post/<id>
//      URL that doesn't expire. This is what we cache.
//   2. creative.object_story_id — fallback when permalink isn't available
//      (e.g. for created-via-API ads). Format: "{page_id}_{post_id}"
//   3. Meta Ads Library URL — last resort, only works for currently-running
//      ads. Format: facebook.com/ads/library/?id={ad_id}
//
// Cache key: `mim:preview:{ad_id}`. TTL 7 days (these don't expire often;
// the refresh-preview API route lets the UI force-invalidate per ad).
//

import { redis } from './redis';

export interface AdPreviewInfo {
  ad_id: string;
  ad_name: string;
  /** Direct FBCDN .mp4 URL (signed, expires in hours). Empty if creative isn't
   *  a video or source couldn't be resolved. Prefer this when present. */
  cdn_url: string;
  /** Facebook permalink (/reel/<vid>/ or /post/...). Stable, doesn't expire.
   *  Used as fallback when cdn_url is unavailable. */
  permalink_url: string;
  thumbnail_url: string;
  /** Underlying creative.video_id, if any (used to refresh the signed cdn_url
   *  without re-resolving the ad). */
  video_id: string;
  /** What kind of Meta entity the aid actually resolved to. Useful when
   *  pre-Jun-10 attribution stored campaign_ids in the aid URL parameter. */
  entity_kind: 'ad' | 'campaign' | 'adset' | 'unknown' | 'error';
  /** Last error reason if we failed to resolve. Empty on success. */
  error: string;
  fetched_at: string;
  cached: boolean;
}

// Slowly-changing metadata (name/thumb/permalink/video_id) — 7 days.
const PREVIEW_TTL_SECONDS = 7 * 24 * 3600;
// Failed / empty-name lookups — cache only briefly so retries happen often.
// Without this short TTL, a one-off Meta hiccup would leave a row nameless
// for 7 days.
const PREVIEW_ERROR_TTL_SECONDS = 5 * 60;
// Signed FBCDN URL — expires fast (typically 6-24h). Cache 30 min to absorb
// burst loads but stay well within signature validity.
const CDN_URL_TTL_SECONDS = 30 * 60;

interface CachedPreviewMeta {
  ad_id: string;
  ad_name: string;
  permalink_url: string;
  thumbnail_url: string;
  video_id: string;
  entity_kind: 'ad' | 'campaign' | 'adset' | 'unknown' | 'error';
  error: string;
  fetched_at: string;
}

/** Resolve signed FBCDN source URLs for a list of video_ids via Graph batch.
 *  Returns map of video_id → signed_url. Cached 30min in Redis.
 *  This is the URL that looks like:
 *    https://scontent.fdel52-1.fna.fbcdn.net/o1/v/.../AQ....mp4?...&oe=ABCD
 */
async function resolveVideoCdnUrls(
  video_ids: string[],
  token: string,
  force_refresh: boolean
): Promise<Record<string, string>> {
  if (!video_ids.length) return {};
  const result: Record<string, string> = {};
  const toFetch: string[] = [];

  if (!force_refresh) {
    const keys = video_ids.map((v) => `mim:cdn:${v}`);
    const cached = await redis.mget<string[]>(...keys);
    for (let i = 0; i < video_ids.length; i++) {
      const vid = video_ids[i];
      const c = cached?.[i];
      if (c && typeof c === 'string') {
        result[vid] = c;
      } else {
        toFetch.push(vid);
      }
    }
  } else {
    toFetch.push(...video_ids);
  }

  if (!toFetch.length) return result;

  for (let i = 0; i < toFetch.length; i += 50) {
    const chunk = toFetch.slice(i, i + 50);
    const batch = chunk.map((vid) => ({
      method: 'GET',
      relative_url: `${vid}?fields=source`,
    }));
    try {
      const res = await axios.post(
        `${GRAPH_BASE}/`,
        new URLSearchParams({
          access_token: token,
          batch: JSON.stringify(batch),
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
      );
      const responses: any[] = res.data || [];
      const pipeline = redis.pipeline();
      let dirty = false;
      for (let j = 0; j < chunk.length; j++) {
        const vid = chunk[j];
        const r = responses[j];
        if (!r || r.code !== 200) continue;
        try {
          const body = JSON.parse(r.body);
          const src: string = body?.source || '';
          if (src) {
            result[vid] = src;
            pipeline.set(`mim:cdn:${vid}`, src, { ex: CDN_URL_TTL_SECONDS });
            dirty = true;
          }
        } catch {
          /* skip */
        }
      }
      if (dirty) await pipeline.exec();
    } catch (err: any) {
      console.error('[meta-graph] video source batch failed:', err?.message || err);
    }
  }
  return result;
}

export async function getMetaAdPreviewUrls(
  ad_ids: string[],
  opts?: { access_token?: string; force_refresh?: boolean }
): Promise<Record<string, AdPreviewInfo>> {
  if (!ad_ids.length) return {};
  const token = getAccessToken(opts?.access_token);
  const force = opts?.force_refresh ?? false;

  // Build map of ad_id → metadata (name, thumb, permalink, video_id).
  // This metadata is slow-changing, so cache 7 days.
  const meta: Record<string, CachedPreviewMeta & { cached: boolean }> = {};
  const toFetch: string[] = [];

  if (!force) {
    const cacheKeys = ad_ids.map((id) => `mim:preview:${id}`);
    const cached = await redis.mget<CachedPreviewMeta[]>(...cacheKeys);
    for (let i = 0; i < ad_ids.length; i++) {
      const aid = ad_ids[i];
      const c = cached?.[i];
      // Only treat as a HIT if we got a usable result. An empty ad_name or
      // an error/unknown entity_kind means the prior fetch was incomplete —
      // retry rather than perpetuate the gap.
      const isGoodHit =
        c &&
        c.ad_id &&
        c.ad_name &&
        c.ad_name.length > 0 &&
        c.entity_kind !== 'error' &&
        c.entity_kind !== 'unknown';
      if (isGoodHit) {
        meta[aid] = { ...c!, cached: true };
      } else {
        toFetch.push(aid);
      }
    }
  } else {
    toFetch.push(...ad_ids);
  }

  // 1. Fetch ad metadata for uncached ids. Pre-Jun-10 some leads have
  //    campaign_id stored in `aid`, so we request `objective` too — its
  //    presence tells us we got a campaign back, not an ad.
  for (let i = 0; i < toFetch.length; i += 50) {
    const chunk = toFetch.slice(i, i + 50);
    const batch = chunk.map((aid) => ({
      method: 'GET',
      relative_url: `${aid}?fields=name,objective,creative{name,permalink_url,object_story_id,thumbnail_url,image_url,image_hash,object_type,video_id,asset_feed_spec{videos{thumbnail_url},images{url}}}`,
    }));
    try {
      const res = await axios.post(
        `${GRAPH_BASE}/`,
        new URLSearchParams({
          access_token: token,
          batch: JSON.stringify(batch),
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
      );
      const responses: any[] = res.data || [];
      const pipeline = redis.pipeline();
      let pipelineDirty = false;
      for (let j = 0; j < chunk.length; j++) {
        const aid = chunk[j];
        const r = responses[j];
        if (!r) {
          meta[aid] = makeErrorMeta(aid, 'no response in batch');
          continue;
        }
        if (r.code !== 200) {
          // Surface what Meta said — most common: 404 (ad deleted) or 400 (id
          // doesn't exist / wrong type).
          let errMsg = `HTTP ${r.code}`;
          try {
            const eBody = JSON.parse(r.body || '{}');
            errMsg = eBody?.error?.message || eBody?.error?.error_user_msg || errMsg;
          } catch { /* ignore */ }
          console.warn(`[meta-graph] preview lookup failed aid=${aid} code=${r.code} msg=${errMsg}`);
          meta[aid] = makeErrorMeta(aid, errMsg);
          continue;
        }
        try {
          const body = JSON.parse(r.body);
          // Detect campaign vs ad. Campaigns have `objective`, ads have `creative`.
          const isCampaign = !!body?.objective && !body?.creative;
          if (isCampaign) {
            const entry: CachedPreviewMeta = {
              ad_id: aid,
              ad_name: body?.name ? `Campaign: ${body.name}` : '(unnamed campaign)',
              permalink_url: `https://www.facebook.com/ads/library/?search_type=keyword_unordered&id=${aid}`,
              thumbnail_url: '',
              video_id: '',
              entity_kind: 'campaign',
              error: 'aid is a campaign_id, not an ad_id (pre-Jun-10 attribution)',
              fetched_at: new Date().toISOString(),
            };
            pipeline.set(`mim:preview:${aid}`, entry, { ex: PREVIEW_TTL_SECONDS });
            pipelineDirty = true;
            meta[aid] = { ...entry, cached: false };
            continue;
          }
          const permalink: string = body?.creative?.permalink_url || '';
          const storyId: string = body?.creative?.object_story_id || '';
          let url = '';
          if (permalink) {
            url = permalink.startsWith('http') ? permalink : `https://www.facebook.com${permalink}`;
          } else if (storyId && storyId.includes('_')) {
            const [pageId, postId] = storyId.split('_');
            url = `https://www.facebook.com/${pageId}/posts/${postId}`;
          } else {
            url = `https://www.facebook.com/ads/library/?id=${aid}`;
          }
          const name: string = body?.name || body?.creative?.name || '';
          // Thumbnail priority: top-level thumbnail → image_url → asset_feed_spec
          // first video's thumbnail → asset_feed_spec first image → image_hash
          // (constructed Graph URL — needs token, so only use if nothing else)
          const afsVideos = body?.creative?.asset_feed_spec?.videos;
          const afsImages = body?.creative?.asset_feed_spec?.images;
          const thumb: string =
            body?.creative?.thumbnail_url ||
            body?.creative?.image_url ||
            (Array.isArray(afsVideos) && afsVideos[0]?.thumbnail_url) ||
            (Array.isArray(afsImages) && afsImages[0]?.url) ||
            '';
          const videoId: string = String(body?.creative?.video_id || '');
          const entry: CachedPreviewMeta = {
            ad_id: aid,
            ad_name: name,
            permalink_url: url,
            thumbnail_url: thumb,
            video_id: videoId,
            entity_kind: 'ad',
            error: name ? '' : 'meta returned ad but no name (unusual)',
            fetched_at: new Date().toISOString(),
          };
          // Short TTL when we got nothing useful (no name) — retry within 5min
          // instead of stale-empty for a week.
          const ttl = name ? PREVIEW_TTL_SECONDS : PREVIEW_ERROR_TTL_SECONDS;
          pipeline.set(`mim:preview:${aid}`, entry, { ex: ttl });
          pipelineDirty = true;
          meta[aid] = { ...entry, cached: false };
        } catch (parseErr: any) {
          console.warn(`[meta-graph] parse failed aid=${aid}: ${parseErr?.message}`);
          meta[aid] = makeErrorMeta(aid, `parse failed: ${parseErr?.message || parseErr}`);
        }
      }
      if (pipelineDirty) await pipeline.exec();
    } catch (err: any) {
      console.error('[meta-graph] preview metadata batch failed:', err?.message || err);
      for (const aid of chunk) {
        meta[aid] = makeErrorMeta(aid, `batch failed: ${err?.message || 'unknown'}`);
      }
    }
  }

  // 2. For all ads with a video_id, resolve the signed FBCDN source URL.
  // Signed URLs expire; cache 30 min. Force-refresh bypasses both layers.
  const videoIdsToResolve = Array.from(
    new Set(Object.values(meta).map((m) => m.video_id).filter((v) => !!v))
  );
  const cdnUrls = await resolveVideoCdnUrls(videoIdsToResolve, token, force);

  // 3. Compose final result
  const result: Record<string, AdPreviewInfo> = {};
  for (const aid of ad_ids) {
    const m = meta[aid];
    if (!m) continue;
    result[aid] = {
      ad_id: m.ad_id,
      ad_name: m.ad_name,
      cdn_url: m.video_id ? cdnUrls[m.video_id] || '' : '',
      permalink_url: m.permalink_url,
      thumbnail_url: m.thumbnail_url,
      video_id: m.video_id,
      entity_kind: m.entity_kind || 'unknown',
      error: m.error || '',
      fetched_at: m.fetched_at,
      cached: m.cached,
    };
  }
  return result;
}

function makeErrorMeta(aid: string, err: string): CachedPreviewMeta & { cached: boolean } {
  // NOTE: We intentionally do NOT cache error entries — let the next page
  // load retry. The 5-min PREVIEW_ERROR_TTL_SECONDS only applies to the
  // "ad with empty name" case (where Meta technically succeeded).
  return {
    ad_id: aid,
    ad_name: '',
    permalink_url: `https://www.facebook.com/ads/library/?id=${aid}`,
    thumbnail_url: '',
    video_id: '',
    entity_kind: 'error',
    error: err,
    fetched_at: new Date().toISOString(),
    cached: false,
  };
}

export async function invalidateAdPreviewCache(ad_id: string): Promise<void> {
  try {
    // Also fetch video_id from the metadata cache so we can clear the CDN
    // URL cache too — otherwise the next read returns the stale signed URL.
    const meta = await redis.get<CachedPreviewMeta>(`mim:preview:${ad_id}`);
    const pipeline = redis.pipeline();
    pipeline.del(`mim:preview:${ad_id}`);
    if (meta?.video_id) pipeline.del(`mim:cdn:${meta.video_id}`);
    await pipeline.exec();
  } catch (err) {
    console.error('[meta-graph] invalidateAdPreviewCache failed:', err);
  }
}
