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
