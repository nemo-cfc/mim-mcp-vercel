/**
 * Pipeboard MCP client (Meta Ads + Google Ads).
 *
 * Pipeboard exposes upstream MCP servers we can call via JSON-RPC over HTTP:
 *   - https://meta-ads.mcp.pipeboard.co/?token=...
 *   - https://google-ads.mcp.pipeboard.co/?token=...
 *
 * We don't need a full MCP SDK on the client side — every interaction is one
 * stateless `tools/call` POST with bearer-style query-param auth.
 */
import axios from 'axios';

const META_URL = 'https://meta-ads.mcp.pipeboard.co/';
const GOOGLE_URL = 'https://google-ads.mcp.pipeboard.co/';

function token(): string {
  const t = process.env.PIPEBOARD_TOKEN;
  if (!t) throw new Error('PIPEBOARD_TOKEN not set');
  return t;
}

/**
 * Generic JSON-RPC `tools/call` against a Pipeboard MCP server.
 * Returns the parsed `content[0].text` — Pipeboard tools return text content
 * containing JSON which we parse on this side.
 */
async function callTool(baseUrl: string, name: string, args: Record<string, any>): Promise<any> {
  const url = `${baseUrl}?token=${encodeURIComponent(token())}`;
  const body = {
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1_000_000),
    method: 'tools/call',
    params: { name, arguments: args },
  };
  const res = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    timeout: 45000,
  });
  if (res.data?.error) {
    throw new Error(`Pipeboard ${name} error: ${JSON.stringify(res.data.error)}`);
  }
  // Pipeboard signals upstream errors via `result.isError = true` while still
  // returning HTTP 200. Surface those clearly so users know the data is bad.
  if (res.data?.result?.isError) {
    const errText =
      res.data.result.content?.[0]?.text ||
      res.data.result.structuredContent?.error_description ||
      'upstream error';
    throw new Error(`Pipeboard ${name} upstream error: ${errText}`);
  }
  const content = res.data?.result?.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error(`Pipeboard ${name}: empty result`);
  }
  // Pipeboard returns either a `text` string (often JSON-encoded) or structured.
  const first = content[0];
  if (first?.type === 'text' && typeof first.text === 'string') {
    try {
      return JSON.parse(first.text);
    } catch {
      return first.text;
    }
  }
  return first;
}

// =============================================================================
// Meta Ads
// =============================================================================

export interface MetaInsightRow {
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

/**
 * Fetch Meta Ads insights at any level for a date range.
 * Defaults to the MiM-Essay-2 ad account.
 */
export async function getMetaInsights(opts: {
  from: string; // YYYY-MM-DD
  to: string;
  level?: 'ad' | 'adset' | 'campaign' | 'account';
  account_id?: string;
  time_breakdown?: 'day' | 'week' | 'month';
  limit?: number;
}): Promise<MetaInsightRow[]> {
  const accountId = opts.account_id || process.env.META_AD_ACCOUNT_ID || 'act_509761434701737';
  const args: Record<string, any> = {
    object_id: accountId,
    time_range: { since: opts.from, until: opts.to },
    level: opts.level || 'ad',
    limit: opts.limit ?? 500,
  };
  // If a Meta access token is provided directly via env, bypass Pipeboard's
  // cached token — useful when that cached token has expired.
  const directToken = process.env.META_ACCESS_TOKEN;
  if (directToken) args.access_token = directToken;
  if (opts.time_breakdown) args.time_breakdown = opts.time_breakdown;
  const result = await callTool(META_URL, 'get_insights', args);
  // Pipeboard returns either { data: [...] } or just an array depending on tool;
  // normalize:
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.insights)) return result.insights;
  return [];
}

/**
 * Convenience wrapper: total spend across all ads in date range.
 */
export async function getMetaSpendByAd(from: string, to: string) {
  const rows = await getMetaInsights({ from, to, level: 'ad' });
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

// =============================================================================
// Google Ads
// =============================================================================

export interface GoogleCampaignMetricsRow {
  campaign_id?: string;
  campaign_name?: string;
  cost_micros?: number; // cost in micros (divide by 1e6)
  cost?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  date?: string;
  [key: string]: any;
}

/**
 * Fetch Google Ads campaign metrics. Pipeboard's interface only takes
 * preset date_range strings (LAST_7_DAYS, LAST_30_DAYS, etc.), not arbitrary
 * since/until. We fetch the smallest preset that covers the requested range
 * with day-level breakdown, then filter to the exact dates on our side.
 */
export async function getGoogleAdsCampaignMetrics(opts: {
  from: string;
  to: string;
  customer_id?: string;
}): Promise<GoogleCampaignMetricsRow[]> {
  const customerId = opts.customer_id || process.env.GOOGLE_ADS_CUSTOMER_ID || '9859642362';

  // Pick the smallest preset that covers the requested range.
  const today = new Date();
  const fromDate = new Date(opts.from);
  const daysAgo = Math.floor((today.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  let preset: string;
  if (daysAgo <= 7) preset = 'LAST_7_DAYS';
  else if (daysAgo <= 30) preset = 'LAST_30_DAYS';
  else preset = 'LAST_90_DAYS';

  const args: Record<string, any> = {
    customer_id: customerId,
    date_range: preset,
    time_breakdown: 'day',
    page_size: 1000,
  };

  const result = await callTool(GOOGLE_URL, 'get_google_ads_campaign_metrics', args);
  // When time_breakdown is set, Pipeboard returns:
  //   { campaigns: [{ id, name, ... no metrics }],
  //     segmented_metrics: [{ date, cost, impressions, ... }, ...] }
  // Otherwise:
  //   { campaigns: [{ id, name, cost, impressions, ... }, ...] }
  // Pick the one that actually has the metrics for this request.
  let raw: GoogleCampaignMetricsRow[];
  if (Array.isArray(result?.segmented_metrics) && result.segmented_metrics.length > 0) {
    raw = result.segmented_metrics;
  } else if (Array.isArray(result?.campaigns)) {
    raw = result.campaigns;
  } else if (Array.isArray(result?.data)) {
    raw = result.data;
  } else if (Array.isArray(result?.metrics)) {
    raw = result.metrics;
  } else if (Array.isArray(result)) {
    raw = result;
  } else {
    raw = [];
  }

  // Filter by date if `date` field exists.
  const filtered = raw.filter((r) => {
    if (!r.date) return true; // keep aggregated rows just in case
    const d = String(r.date).slice(0, 10);
    return d >= opts.from && d <= opts.to;
  });

  // Normalize cost — Google API uses cost_micros; some versions return cost.
  return filtered.map((r) => {
    const cost =
      typeof r.cost === 'number'
        ? r.cost
        : typeof r.cost_micros === 'number'
        ? r.cost_micros / 1_000_000
        : typeof r.cost_micros === 'string'
        ? Number(r.cost_micros) / 1_000_000
        : 0;
    return { ...r, cost };
  });
}

/**
 * Convenience: total Google Ads spend for a date range.
 */
export async function getGoogleAdsTotalSpend(from: string, to: string): Promise<number> {
  const rows = await getGoogleAdsCampaignMetrics({ from, to });
  return rows.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
}
