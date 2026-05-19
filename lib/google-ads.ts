/**
 * Direct Google Ads API client (bypasses Pipeboard).
 *
 * Pipeboard's Google Ads endpoint exhausted its shared Google Cloud quota
 * (RESOURCE_EXHAUSTED). Like the Meta side, we now talk to Google directly.
 *
 * Google Ads API needs more secrets than Meta Graph API:
 *   GOOGLE_ADS_DEVELOPER_TOKEN   from your Google Ads account API Center
 *   GOOGLE_ADS_CLIENT_ID         OAuth 2.0 desktop client (Google Cloud Console)
 *   GOOGLE_ADS_CLIENT_SECRET     pair with the above
 *   GOOGLE_ADS_REFRESH_TOKEN     one-time OAuth flow result
 *   GOOGLE_ADS_CUSTOMER_ID       the ad account ID (already set: 9859642362)
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID optional — manager account ID if access is
 *                                via a manager. Default: same as customer_id.
 *
 * Auth flow:
 *   1. Exchange refresh_token + client_id + client_secret for an access_token
 *      via https://oauth2.googleapis.com/token (1-hour TTL).
 *   2. Cache the access_token in module memory until it expires.
 *   3. Send queries to googleads.googleapis.com with:
 *        Authorization: Bearer <access_token>
 *        developer-token: <dev_token>
 *        login-customer-id: <manager_id>  (optional)
 *
 * GAQL: Google Ads Query Language. SQL-like. Docs:
 *   https://developers.google.com/google-ads/api/docs/query/overview
 */
import axios from 'axios';

const API_VERSION = 'v18';
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Module-level access-token cache (1 instance per warm Vercel function).
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getEnv(name: string, opts?: { fallback?: string }): string {
  const v = process.env[name] || opts?.fallback;
  if (!v) {
    throw new Error(`${name} env var not set. See lib/google-ads.ts header for setup steps.`);
  }
  return v;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 30_000) {
    return cachedAccessToken.token;
  }

  const clientId = getEnv('GOOGLE_ADS_CLIENT_ID');
  const clientSecret = getEnv('GOOGLE_ADS_CLIENT_SECRET');
  const refreshToken = getEnv('GOOGLE_ADS_REFRESH_TOKEN');

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  let res;
  try {
    res = await axios.post(OAUTH_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });
  } catch (err: any) {
    const detail = err?.response?.data?.error_description || err?.response?.data?.error || err?.message;
    throw new Error(`Google OAuth refresh failed: ${detail}`);
  }
  const token = res.data?.access_token;
  const expiresIn = Number(res.data?.expires_in || 3600);
  if (!token) throw new Error('Google OAuth: no access_token in response');
  cachedAccessToken = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}

/**
 * Run a GAQL query against the customer's account.
 * Returns the array of rows (paginated under the hood).
 */
export async function runGAQL(query: string, customerIdOverride?: string): Promise<any[]> {
  const customerId = (customerIdOverride || getEnv('GOOGLE_ADS_CUSTOMER_ID')).replace(/-/g, '');
  const loginCustomerId = (
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId
  ).replace(/-/g, '');
  const developerToken = getEnv('GOOGLE_ADS_DEVELOPER_TOKEN');
  const accessToken = await getAccessToken();

  const url = `${API_BASE}/customers/${customerId}/googleAds:searchStream`;
  let res;
  try {
    res = await axios.post(
      url,
      { query },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
  } catch (err: any) {
    const detail =
      err?.response?.data?.error?.message ||
      err?.response?.data?.[0]?.error?.message ||
      JSON.stringify(err?.response?.data || {}).slice(0, 300) ||
      err?.message;
    throw new Error(`Google Ads API ${err?.response?.status || ''}: ${detail}`);
  }

  // searchStream returns an array of "stream" chunks; each has a results array.
  const data = res.data;
  const stream: any[] = Array.isArray(data) ? data : [data];
  const rows: any[] = [];
  for (const chunk of stream) {
    if (Array.isArray(chunk?.results)) rows.push(...chunk.results);
  }
  return rows;
}

export interface GoogleCampaignDailyRow {
  date: string; // YYYY-MM-DD
  campaign_id: string;
  campaign_name: string;
  cost: number; // in account currency (₹)
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number; // 0-1
}

/**
 * Daily campaign metrics for a date range. Mirrors the shape Pipeboard's
 * `getGoogleAdsCampaignMetrics` returned, so reports.ts code is unchanged.
 */
export async function getGoogleAdsCampaignMetricsDirect(opts: {
  from: string;
  to: string;
  customer_id?: string;
}): Promise<GoogleCampaignDailyRow[]> {
  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.ctr
    FROM campaign
    WHERE segments.date BETWEEN '${opts.from}' AND '${opts.to}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date
  `.trim();

  const rows = await runGAQL(query, opts.customer_id);
  return rows.map((r: any) => ({
    date: r.segments?.date || '',
    campaign_id: String(r.campaign?.id || ''),
    campaign_name: String(r.campaign?.name || ''),
    cost: Number(r.metrics?.costMicros || 0) / 1_000_000,
    impressions: Number(r.metrics?.impressions || 0),
    clicks: Number(r.metrics?.clicks || 0),
    conversions: Number(r.metrics?.conversions || 0),
    ctr: Number(r.metrics?.ctr || 0),
  }));
}

/** Total Google Ads spend for a date range. */
export async function getGoogleAdsTotalSpendDirect(from: string, to: string): Promise<number> {
  const rows = await getGoogleAdsCampaignMetricsDirect({ from, to });
  return rows.reduce((sum, r) => sum + r.cost, 0);
}
