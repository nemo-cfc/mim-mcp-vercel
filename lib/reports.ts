/**
 * Marketing dashboard report builders.
 *
 * Combines three data sources for a single date range:
 *   1. MiM Essay CRM leads (with attribution + quality)
 *   2. Meta Ads spend per ad/campaign (Pipeboard)
 *   3. Google Ads spend per campaign (Pipeboard)
 *
 * Computes CPL, CPQL, lane breakdowns, top winner / kill ads, and optional
 * Gemini-generated commentary. Mirrors the canonical report shapes from the
 * mim-essay-volume-report and mim-essay-quality-report skills.
 */
import { fetchLeadsForRange } from './mim-essay-api';
import {
  enrichLead,
  isMimEssayLead,
  categorizeStage,
  type MimLead,
  type EnrichedLead,
  type StageCategory,
} from './attribution';
import {
  getMetaSpendByAd,
  getMetaInsights,
  getGoogleAdsCampaignMetrics,
  type MetaInsightRow,
} from './pipeboard';
import { generateMarketingInsight } from './gemini';

// =============================================================================
// Helpers
// =============================================================================

const KILL_THRESHOLDS = {
  cpl_max: 1103,
  qual_rate_min: 15,
  good_rate_min: 5,
  frequency_max: 3.0,
  cpm_max: 150,
};

function classifyLane(campaignName: string | undefined): string {
  if (!campaignName) return 'Unknown';
  const name = campaignName.toUpperCase();
  if (/\bC1\b/.test(name) || /COLD/.test(name) || /REVIVAL/.test(name)) return 'C1-Cold';
  if (/\bC2\b/.test(name) || /REMARKET|PE SE/.test(name)) return 'C2-Remarketing';
  if (/\bC3\b/.test(name) || (/THRUPLAY/.test(name) && /BROAD/.test(name))) return 'C3-ThruPlay';
  if (/\bC4\b/.test(name) || (/THRUPLAY/.test(name) && /RETARGET/.test(name)))
    return 'C4-ThruPlayRetargeting';
  if (/\bC5\b/.test(name) || /ENGAGEMENT/.test(name)) return 'C5-Engagement';
  return 'Other';
}

/** Extract Facebook ad_id from CRM source URL (`?aid=12345`). */
function extractAdId(url: string | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/[?&]aid=(\d+)/);
  return m ? m[1] : null;
}

function adStatus(qual_rate: number, good_rate: number, leads: number): string {
  if (leads < 5) return 'INSUFFICIENT_DATA';
  if (good_rate >= 25 && qual_rate >= 40) return 'WINNER';
  if (good_rate >= 15 && qual_rate >= 30) return 'GOOD';
  if (good_rate >= 10 || qual_rate >= 20) return 'MONITOR';
  return 'KILL';
}

interface DateRange {
  from: string;
  to: string;
}

// =============================================================================
// Volume Report
// =============================================================================

export interface VolumeReport {
  date_range: DateRange;
  totals: {
    leads: number;
    spend_meta: number;
    spend_google: number;
    spend_total: number;
    blended_cpl: number;
    qualified: number;
    good: number;
    qualified_rate: number;
    good_rate: number;
    cpql: number; // cost per qualified lead
  };
  channels: Array<{
    channel: string;
    leads: number;
    spend: number;
    cpl: number;
    qualified: number;
    good: number;
    qualified_rate: number;
    good_rate: number;
  }>;
  meta_lanes: Array<{
    lane: string;
    spend: number;
    spend_share: number;
    leads: number;
    cpl: number;
    qualified: number;
    cpql: number;
    good: number;
    status: string;
  }>;
  top_ads: Array<{
    ad_name: string;
    ad_id: string;
    lane: string;
    leads: number;
    qualified: number;
    qual_rate: number;
    good: number;
    good_rate: number;
    spend: number;
    cpl: number;
    cpql: number;
    frequency: number;
    cpm: number;
    status: string;
  }>;
  google_ads: {
    spend: number;
    leads: number;
    cpl: number;
    qualified: number;
    cpql: number;
  };
  notes: string[];
}

export interface DailyTrendRow {
  date: string;
  leads: number;
  qualified: number;
  good: number;
  spend_meta: number;
  spend_google: number;
  spend_total: number;
  cpl: number;
  cpql: number;
  cpm: number;
  ctr: number;
  frequency: number;
  impressions: number;
}

export interface DecayContext {
  focal_date: string;
  cpl: { focal: number; avg_7d: number; avg_14d: number; drift_pct_vs_7d: number; alert: boolean };
  cpql: { focal: number; avg_7d: number; drift_pct: number; alert: boolean };
  frequency: { focal: number; avg_7d: number; velocity_per_day: number; alert: boolean };
  ctr: { focal: number; avg_7d: number; decay_pct: number; alert: boolean };
  cpm: { focal: number; avg_7d: number; drift_pct: number; alert: boolean };
  good_rate: { focal: number; avg_7d: number; drop_pp: number; alert: boolean };
  notes: string[];
}

export interface CombinedDashboard extends VolumeReport {
  focal_date?: string;
  date_field?: 'created_at' | 'booked_at';
  stage_distribution: Array<{ stage: string; count: number; pct: number; category: StageCategory }>;
  daily_trend?: DailyTrendRow[];
  decay?: DecayContext;
  insights?: string;
  /** Quality view extensions — populated when focal_date is set */
  quality?: QualityContext;
}

export interface QualityContext {
  focal_date: string;
  // Focal day numbers
  leads: number;
  qualified: number;
  good: number;
  qualified_rate: number;
  good_rate: number;
  cpql: number;
  cpgl: number;
  spend_leadgen: number; // Meta C1+C2+C4 lanes (same as the skill)

  // Comparison: previous day
  prev_day: { date: string; leads: number; qualified: number; good: number; cpql: number; cpgl: number; spend_leadgen: number };

  // Comparison: trailing 7d (excluding focal)
  trailing_7d: { leads: number; qualified: number; good: number; qualified_rate: number; good_rate: number; cpql: number; cpgl: number; spend_leadgen: number };

  // Deltas
  delta_leads_vs_prev: number;
  delta_leads_vs_7d_avg: number;
  delta_cpql_vs_prev: number;
  delta_cpql_vs_7d: number;
  delta_cpgl_vs_prev: number;
  delta_cpgl_vs_7d: number;
  delta_qual_pp_vs_7d: number; // percentage-point delta
  delta_good_pp_vs_7d: number;

  // School Shortlisting projection (skill: leads at SS not yet graded)
  ss_pending_count: number;
  ss_projection: {
    prior_good_given_qual_rate: number; // 6D rate excl focal, used as multiplier
    projected_extra_good: number;
    projected_total_good: number;
    projected_good_rate: number;
    projected_cpgl: number;
  };

  // Per-channel deltas vs trailing-7d (excluding focal)
  channels: Array<{
    channel: string;
    leads: number;
    qualified: number;
    good: number;
    qualified_rate: number;
    good_rate: number;
    leads_7d: number;
    qual_rate_7d: number;
    good_rate_7d: number;
    delta_qual_pp: number;
    delta_good_pp: number;
  }>;

  // 7d rolling table rows (date-by-date)
  daily_quality: Array<{
    date: string;
    weekday: string;
    leads: number;
    qualified: number;
    good: number;
    qualified_rate: number;
    good_rate: number;
    is_focal: boolean;
  }>;

  // Insight bullets (emoji-led, ready to render)
  insight_bullets: string[];
}

function dailyDate(d: string): string {
  return d.slice(0, 10);
}

/**
 * Spend mapping by channel. Per the volume-report skill:
 *   Cold Leads - Meta -> C1 spend
 *   MOF Remarketing   -> C2 + C4 spend
 *   Google Ads        -> Google daily spend
 *   Others            -> 0 (organic)
 */
function attachChannelSpend(
  channels: Array<any>,
  metaLanes: VolumeReport['meta_lanes'],
  googleSpend: number
) {
  const c1 = metaLanes.find((l) => l.lane === 'C1-Cold')?.spend ?? 0;
  const c2 = metaLanes.find((l) => l.lane === 'C2-Remarketing')?.spend ?? 0;
  const c4 = metaLanes.find((l) => l.lane === 'C4-ThruPlayRetargeting')?.spend ?? 0;
  for (const ch of channels) {
    if (ch.channel.startsWith('Cold Leads - Meta')) ch.spend = c1;
    else if (ch.channel === 'MOF Remarketing') ch.spend = c2 + c4;
    else if (ch.channel === 'Google Ads') ch.spend = googleSpend;
    else ch.spend = 0;
    ch.cpl = ch.leads > 0 ? +(ch.spend / ch.leads).toFixed(2) : 0;
  }
}

export async function buildVolumeReport(
  range: DateRange,
  opts?: {
    includeInsights?: boolean;
    focalDate?: string;
    includeDailyTrend?: boolean;
    /**
     * Which CRM date field to filter & group leads by. Defaults to 'created_at'.
     * 'booked_at' = leads grouped by when the call was booked (useful when
     * comparing against ad spend on the booking day rather than the creation day).
     */
    dateField?: 'created_at' | 'booked_at';
    /**
     * Optional per-call Meta Graph API access token override. Falls back to
     * the META_ACCESS_TOKEN env var, then Pipeboard's cached token.
     */
    metaAccessToken?: string;
  }
): Promise<CombinedDashboard> {
  const dateField = opts?.dateField || 'created_at';
  const metaAccessToken = opts?.metaAccessToken;
  // Parallelize the three fetches. Capture upstream errors so we can surface
  // them in the response notes (otherwise empty arrays look identical to "no
  // spend in this window" which is misleading).
  const upstreamErrors: { meta?: string; google?: string } = {};
  const [crmRes, metaAds, googleRows] = await Promise.all([
    fetchLeadsForRange({ from: range.from, to: range.to, dateField }),
    getMetaSpendByAd(range.from, range.to, metaAccessToken).catch((e) => {
      upstreamErrors.meta = e?.message || 'unknown';
      console.warn('[reports] Meta fetch failed:', upstreamErrors.meta);
      return [] as Awaited<ReturnType<typeof getMetaSpendByAd>>;
    }),
    getGoogleAdsCampaignMetrics({ from: range.from, to: range.to }).catch((e) => {
      upstreamErrors.google = e?.message || 'unknown';
      console.warn('[reports] Google fetch failed:', upstreamErrors.google);
      return [] as Awaited<ReturnType<typeof getGoogleAdsCampaignMetrics>>;
    }),
  ]);

  // Filter brand + enrich + filter to date range (CRM filter already applied,
  // but be defensive for boundary issues).
  const enriched: Array<EnrichedLead & { ad_id: string | null }> = [];
  for (const lead of crmRes.leads) {
    if (!isMimEssayLead(lead)) continue;
    const e = enrichLead(lead);
    const dateVal = dateField === 'booked_at' ? e.booked_at : e.created_at;
    const d = dailyDate(dateVal || '');
    if (!d || d < range.from || d > range.to) continue;
    enriched.push({ ...e, ad_id: extractAdId(e.source) });
  }

  // Channel aggregation
  const byChannel = new Map<
    string,
    { channel: string; leads: number; qualified: number; good: number; spend: number; cpl: number; qualified_rate: number; good_rate: number }
  >();
  for (const l of enriched) {
    const key =
      l.channel === 'Cold Leads - Meta' && l.meta_sub_channel
        ? `${l.channel} (${l.meta_sub_channel})`
        : l.channel;
    if (!byChannel.has(key)) {
      byChannel.set(key, {
        channel: key,
        leads: 0,
        qualified: 0,
        good: 0,
        spend: 0,
        cpl: 0,
        qualified_rate: 0,
        good_rate: 0,
      });
    }
    const row = byChannel.get(key)!;
    row.leads++;
    if (l.is_qualified) row.qualified++;
    if (l.is_good) row.good++;
  }
  const channels = Array.from(byChannel.values()).map((r) => ({
    ...r,
    qualified_rate: r.leads > 0 ? +((r.qualified / r.leads) * 100).toFixed(2) : 0,
    good_rate: r.leads > 0 ? +((r.good / r.leads) * 100).toFixed(2) : 0,
  }));
  channels.sort((a, b) => b.leads - a.leads);

  // Meta ad-level join (CRM lead.ad_id ↔ Meta ad_id)
  const adsById = new Map<string, MetaInsightRow & { lane: string }>();
  for (const a of metaAds) {
    if (!a.ad_id) continue;
    adsById.set(String(a.ad_id), { ...a, lane: classifyLane(a.campaign_name) });
  }

  // Per-ad rollup — spend from Meta, leads/qual/good from CRM by ad_id match
  const adRollup = new Map<
    string,
    { ad_id: string; ad_name: string; lane: string; leads: number; qualified: number; good: number; spend: number; frequency: number; cpm: number }
  >();
  // Seed with all Meta ads that had spend (so non-converting ads still show).
  for (const a of metaAds) {
    const id = String(a.ad_id || '');
    if (!id) continue;
    adRollup.set(id, {
      ad_id: id,
      ad_name: a.ad_name || '(unnamed)',
      lane: classifyLane(a.campaign_name),
      leads: 0,
      qualified: 0,
      good: 0,
      spend: Number(a.spend || 0),
      frequency: Number(a.frequency || 0),
      cpm: Number(a.cpm || 0),
    });
  }
  // Add CRM lead counts.
  for (const l of enriched) {
    if (!l.ad_id) continue;
    const row = adRollup.get(l.ad_id);
    if (!row) {
      // Lead has aid= but Meta has no spend record (deleted ad / outside window).
      adRollup.set(l.ad_id, {
        ad_id: l.ad_id,
        ad_name: '(unknown ad)',
        lane: 'Other',
        leads: 1,
        qualified: l.is_qualified ? 1 : 0,
        good: l.is_good ? 1 : 0,
        spend: 0,
        frequency: 0,
        cpm: 0,
      });
    } else {
      row.leads++;
      if (l.is_qualified) row.qualified++;
      if (l.is_good) row.good++;
    }
  }

  // Lane rollup
  const laneTotals = new Map<
    string,
    { lane: string; spend: number; leads: number; qualified: number; good: number }
  >();
  for (const a of adRollup.values()) {
    if (!laneTotals.has(a.lane)) {
      laneTotals.set(a.lane, { lane: a.lane, spend: 0, leads: 0, qualified: 0, good: 0 });
    }
    const t = laneTotals.get(a.lane)!;
    t.spend += a.spend;
    t.leads += a.leads;
    t.qualified += a.qualified;
    t.good += a.good;
  }
  const totalMetaSpend = Array.from(laneTotals.values()).reduce((s, l) => s + l.spend, 0);
  const meta_lanes: VolumeReport['meta_lanes'] = Array.from(laneTotals.values())
    .map((l) => ({
      lane: l.lane,
      spend: +l.spend.toFixed(2),
      spend_share: totalMetaSpend > 0 ? +((l.spend / totalMetaSpend) * 100).toFixed(2) : 0,
      leads: l.leads,
      cpl: l.leads > 0 ? +(l.spend / l.leads).toFixed(2) : 0,
      qualified: l.qualified,
      cpql: l.qualified > 0 ? +(l.spend / l.qualified).toFixed(2) : 0,
      good: l.good,
      status:
        l.leads === 0
          ? 'NO_LEADS'
          : l.qualified / l.leads >= 0.4 && l.good / l.leads >= 0.25
          ? 'WINNER'
          : l.qualified / l.leads < 0.15 || l.good / l.leads < 0.05
          ? 'KILL'
          : 'OK',
    }))
    .sort((a, b) => b.spend - a.spend);

  // Top ads (by lead volume) with status
  const top_ads = Array.from(adRollup.values())
    .map((a) => {
      const qual_rate = a.leads > 0 ? +((a.qualified / a.leads) * 100).toFixed(2) : 0;
      const good_rate = a.leads > 0 ? +((a.good / a.leads) * 100).toFixed(2) : 0;
      return {
        ad_id: a.ad_id,
        ad_name: a.ad_name,
        lane: a.lane,
        leads: a.leads,
        qualified: a.qualified,
        qual_rate,
        good: a.good,
        good_rate,
        spend: +a.spend.toFixed(2),
        cpl: a.leads > 0 ? +(a.spend / a.leads).toFixed(2) : 0,
        cpql: a.qualified > 0 ? +(a.spend / a.qualified).toFixed(2) : 0,
        frequency: +a.frequency.toFixed(2),
        cpm: +a.cpm.toFixed(2),
        status: adStatus(qual_rate, good_rate, a.leads),
      };
    })
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 30);

  // Google
  const googleSpend = googleRows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  // Heuristic: leads attributed to Google Ads channel
  const googleLeads = enriched.filter((l) => l.channel === 'Google Ads');
  const googleQualified = googleLeads.filter((l) => l.is_qualified).length;
  const google_ads = {
    spend: +googleSpend.toFixed(2),
    leads: googleLeads.length,
    cpl: googleLeads.length > 0 ? +(googleSpend / googleLeads.length).toFixed(2) : 0,
    qualified: googleQualified,
    cpql: googleQualified > 0 ? +(googleSpend / googleQualified).toFixed(2) : 0,
  };

  attachChannelSpend(channels, meta_lanes, googleSpend);

  // Totals
  const totalLeads = enriched.length;
  const totalQualified = enriched.filter((l) => l.is_qualified).length;
  const totalGood = enriched.filter((l) => l.is_good).length;
  const totalSpend = totalMetaSpend + googleSpend;

  const totals = {
    leads: totalLeads,
    spend_meta: +totalMetaSpend.toFixed(2),
    spend_google: +googleSpend.toFixed(2),
    spend_total: +totalSpend.toFixed(2),
    blended_cpl: totalLeads > 0 ? +(totalSpend / totalLeads).toFixed(2) : 0,
    qualified: totalQualified,
    good: totalGood,
    qualified_rate: totalLeads > 0 ? +((totalQualified / totalLeads) * 100).toFixed(2) : 0,
    good_rate: totalLeads > 0 ? +((totalGood / totalLeads) * 100).toFixed(2) : 0,
    cpql: totalQualified > 0 ? +(totalSpend / totalQualified).toFixed(2) : 0,
  };

  // Stage distribution (focal day if focalDate is set, otherwise window)
  const stageScope =
    opts?.focalDate
      ? enriched.filter((l) => {
          const dateVal = dateField === 'booked_at' ? l.booked_at : l.created_at;
          return (dateVal || '').slice(0, 10) === opts.focalDate;
        })
      : enriched;
  const stageCounts = new Map<string, number>();
  for (const l of stageScope) {
    stageCounts.set(l.stage, (stageCounts.get(l.stage) || 0) + 1);
  }
  const stageScopeTotal = stageScope.length;
  const stage_distribution = Array.from(stageCounts.entries())
    .map(([stage, count]) => ({
      stage,
      count,
      pct: stageScopeTotal > 0 ? +((count / stageScopeTotal) * 100).toFixed(2) : 0,
      category: categorizeStage(stage),
    }))
    .sort((a, b) => b.count - a.count);

  const notes: string[] = [];
  if (crmRes.source === 'cache') notes.push('CRM data served from short-TTL cache.');
  if (metaAds.length === 0) notes.push('Meta Ads spend unavailable for this range.');
  if (googleRows.length === 0) notes.push('Google Ads spend unavailable for this range.');

  const dashboard: CombinedDashboard = {
    date_range: range,
    date_field: dateField,
    totals,
    channels,
    meta_lanes,
    top_ads,
    google_ads,
    stage_distribution,
    notes,
  };

  // ----------------------------------------------------------------------------
  // Daily trend (per-day slice) and decay context (focal day vs trailing window)
  // ----------------------------------------------------------------------------
  const wantTrend = opts?.includeDailyTrend !== false; // default on
  const focalDate = opts?.focalDate;
  if (wantTrend) {
    try {
      const dailyMeta = await getMetaInsights({
        from: range.from,
        to: range.to,
        level: 'account',
        time_breakdown: 'day',
        limit: 200,
        access_token: metaAccessToken,
      });
      // Index Meta daily totals by date.
      type DailyMetaAgg = {
        spend: number;
        impressions: number;
        clicks: number;
        ctr: number;
        cpm: number;
        frequency: number;
        rows: number;
      };
      const metaByDate = new Map<string, DailyMetaAgg>();
      for (const r of dailyMeta) {
        const date = (r.date_start || '').slice(0, 10);
        if (!date) continue;
        if (!metaByDate.has(date)) {
          metaByDate.set(date, {
            spend: 0,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            cpm: 0,
            frequency: 0,
            rows: 0,
          });
        }
        const agg = metaByDate.get(date)!;
        agg.spend += Number(r.spend || 0);
        agg.impressions += Number(r.impressions || 0);
        agg.clicks += Number(r.clicks || 0);
        agg.ctr += Number(r.ctr || 0);
        agg.cpm += Number(r.cpm || 0);
        agg.frequency += Number(r.frequency || 0);
        agg.rows++;
      }

      // Index Google daily by date.
      const googleByDate = new Map<string, number>();
      for (const r of googleRows) {
        const date = (r.date || '').toString().slice(0, 10);
        if (!date) continue;
        googleByDate.set(date, (googleByDate.get(date) || 0) + (Number(r.cost) || 0));
      }

      // Index CRM by date — using whichever date field the report is keyed on.
      type DailyCrmAgg = { leads: number; qualified: number; good: number };
      const crmByDate = new Map<string, DailyCrmAgg>();
      for (const l of enriched) {
        const dateVal = dateField === 'booked_at' ? l.booked_at : l.created_at;
        const d = (dateVal || '').slice(0, 10);
        if (!d) continue;
        if (!crmByDate.has(d)) crmByDate.set(d, { leads: 0, qualified: 0, good: 0 });
        const a = crmByDate.get(d)!;
        a.leads++;
        if (l.is_qualified) a.qualified++;
        if (l.is_good) a.good++;
      }

      // Build daily rows in order from->to.
      const allDates: string[] = [];
      const start = new Date(range.from + 'T00:00:00Z');
      const end = new Date(range.to + 'T00:00:00Z');
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        allDates.push(d.toISOString().slice(0, 10));
      }

      const daily_trend: DailyTrendRow[] = allDates.map((date) => {
        const m = metaByDate.get(date);
        const c = crmByDate.get(date) || { leads: 0, qualified: 0, good: 0 };
        const g = googleByDate.get(date) || 0;
        const meta_spend = m?.spend ?? 0;
        const total_spend = meta_spend + g;
        // CTR/CPM/frequency at account level — average across rows for that date.
        const ctr = m && m.rows > 0 ? m.ctr / m.rows : 0;
        const cpm = m && m.rows > 0 ? m.cpm / m.rows : 0;
        const frequency = m && m.rows > 0 ? m.frequency / m.rows : 0;
        return {
          date,
          leads: c.leads,
          qualified: c.qualified,
          good: c.good,
          spend_meta: +meta_spend.toFixed(2),
          spend_google: +g.toFixed(2),
          spend_total: +total_spend.toFixed(2),
          cpl: c.leads > 0 ? +(total_spend / c.leads).toFixed(2) : 0,
          cpql: c.qualified > 0 ? +(total_spend / c.qualified).toFixed(2) : 0,
          cpm: +cpm.toFixed(2),
          ctr: +ctr.toFixed(2),
          frequency: +frequency.toFixed(2),
          impressions: m?.impressions ?? 0,
        };
      });

      dashboard.daily_trend = daily_trend;

      // ---- Decay context (only if focalDate is supplied and present in trend) ----
      if (focalDate) {
        const focalRow = daily_trend.find((d) => d.date === focalDate);
        if (focalRow) {
          const focalIdx = daily_trend.findIndex((d) => d.date === focalDate);
          const last7 = daily_trend.slice(Math.max(0, focalIdx - 7), focalIdx); // up to 7 prior days
          const last14 = daily_trend.slice(Math.max(0, focalIdx - 14), focalIdx);
          const avg = (xs: number[]) =>
            xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

          const cpl7 = avg(last7.filter((d) => d.cpl > 0).map((d) => d.cpl));
          const cpl14 = avg(last14.filter((d) => d.cpl > 0).map((d) => d.cpl));
          const cplDrift = cpl7 > 0 ? +(((focalRow.cpl - cpl7) / cpl7) * 100).toFixed(2) : 0;

          const cpql7 = avg(last7.filter((d) => d.cpql > 0).map((d) => d.cpql));
          const cpqlDrift =
            cpql7 > 0 ? +(((focalRow.cpql - cpql7) / cpql7) * 100).toFixed(2) : 0;

          const freq7 = avg(last7.map((d) => d.frequency));
          // Velocity: simple slope of last 7 days frequency
          const freqVelocity = (() => {
            const xs = last7.map((d) => d.frequency);
            if (xs.length < 2) return 0;
            const n = xs.length;
            const meanY = xs.reduce((a, b) => a + b, 0) / n;
            const meanX = (n - 1) / 2;
            let num = 0,
              den = 0;
            for (let i = 0; i < n; i++) {
              num += (i - meanX) * (xs[i] - meanY);
              den += (i - meanX) ** 2;
            }
            return den > 0 ? +(num / den).toFixed(3) : 0;
          })();

          const ctr7 = avg(last7.filter((d) => d.ctr > 0).map((d) => d.ctr));
          const ctrDecay = ctr7 > 0 ? +(((focalRow.ctr - ctr7) / ctr7) * 100).toFixed(2) : 0;

          const cpm7 = avg(last7.filter((d) => d.cpm > 0).map((d) => d.cpm));
          const cpmDrift = cpm7 > 0 ? +(((focalRow.cpm - cpm7) / cpm7) * 100).toFixed(2) : 0;

          const goodRate = (row: DailyTrendRow) =>
            row.leads > 0 ? (row.good / row.leads) * 100 : 0;
          const focalGoodRate = +goodRate(focalRow).toFixed(2);
          const goodRate7 = avg(last7.map(goodRate));
          const goodDropPp = +(focalGoodRate - goodRate7).toFixed(2);

          const decayNotes: string[] = [];
          if (cplDrift > 50) decayNotes.push(`CPL up ${cplDrift}% vs 7d avg — kill candidate.`);
          if (cpqlDrift > 50) decayNotes.push(`CPQL up ${cpqlDrift}% vs 7d avg.`);
          if (focalRow.frequency > 3.0)
            decayNotes.push(
              `Frequency at ${focalRow.frequency.toFixed(2)} (>3.0 fatigue threshold).`
            );
          if (freqVelocity > 0.05)
            decayNotes.push(`Frequency rising ${(freqVelocity * 7).toFixed(2)}/wk.`);
          if (ctrDecay < -25) decayNotes.push(`CTR down ${Math.abs(ctrDecay)}% vs 7d avg.`);
          if (cpmDrift > 30) decayNotes.push(`CPM up ${cpmDrift}% vs 7d avg.`);
          if (goodDropPp < -5)
            decayNotes.push(
              `Good rate dropped ${Math.abs(goodDropPp)}pp vs 7d avg (${focalGoodRate}% vs ${goodRate7.toFixed(2)}%).`
            );

          dashboard.focal_date = focalDate;

          // ---- Quality context (matches the canonical Quality Report skill) ----
          {
            // Per-day enriched-lead lookup for focal + comparison windows
            const dateOf = (l: EnrichedLead) =>
              ((dateField === 'booked_at' ? l.booked_at : l.created_at) || '').slice(0, 10);
            const allDays = daily_trend.map((d) => d.date);
            const focalDayLeads = enriched.filter((l) => dateOf(l) === focalDate);
            const ssPendingCount = focalDayLeads.filter(
              (l) => (l.stage || '').toLowerCase().trim() === 'school shortlisting'
            ).length;

            // Trailing 7d window (excluding focal)
            const trailingDates = allDays.slice(Math.max(0, focalIdx - 7), focalIdx);
            const trailingLeads = enriched.filter((l) => trailingDates.includes(dateOf(l)));
            const trailingDailyMeta = last7; // already excludes focal

            const trailingMetaSpend = trailingDailyMeta.reduce((s, d) => s + d.spend_meta, 0);
            const trailingGoogleSpend = trailingDailyMeta.reduce((s, d) => s + d.spend_google, 0);
            const trailingTotal = trailingLeads.length;
            const trailingQual = trailingLeads.filter((l) => l.is_qualified).length;
            const trailingGood = trailingLeads.filter((l) => l.is_good).length;
            // LeadGen spend = Meta + Google (excluding ToF/engagement); we
            // approximate using total Meta+Google since lane data is window-level.
            const trailingLeadgenSpend = trailingMetaSpend + trailingGoogleSpend;

            // Previous day
            const prevDate = trailingDates[trailingDates.length - 1] || '';
            const prevDayMeta = daily_trend.find((d) => d.date === prevDate);
            const prevDayLeads = enriched.filter((l) => dateOf(l) === prevDate);
            const prevQual = prevDayLeads.filter((l) => l.is_qualified).length;
            const prevGood = prevDayLeads.filter((l) => l.is_good).length;
            const prevSpendLeadgen = (prevDayMeta?.spend_meta || 0) + (prevDayMeta?.spend_google || 0);
            const prevCpql = prevQual > 0 ? prevSpendLeadgen / prevQual : 0;
            const prevCpgl = prevGood > 0 ? prevSpendLeadgen / prevGood : 0;

            // Focal day (using enriched leads, not daily_trend, to avoid double-counting)
            const focalQual = focalDayLeads.filter((l) => l.is_qualified).length;
            const focalGood = focalDayLeads.filter((l) => l.is_good).length;
            const focalSpendLeadgen =
              (focalRow?.spend_meta || 0) + (focalRow?.spend_google || 0);
            const focalCpql = focalQual > 0 ? focalSpendLeadgen / focalQual : 0;
            const focalCpgl = focalGood > 0 ? focalSpendLeadgen / focalGood : 0;
            const focalLeads = focalDayLeads.length;
            const focalQualRate = focalLeads > 0 ? (focalQual / focalLeads) * 100 : 0;
            const focalGoodRateQ = focalLeads > 0 ? (focalGood / focalLeads) * 100 : 0;

            // 7d avg derivatives
            const trailingDays = trailingDates.length || 1;
            const trailingAvgLeads = trailingTotal / trailingDays;
            const trailingQualRate = trailingTotal > 0 ? (trailingQual / trailingTotal) * 100 : 0;
            const trailingGoodRate = trailingTotal > 0 ? (trailingGood / trailingTotal) * 100 : 0;
            const trailingCpql =
              trailingQual > 0 ? trailingLeadgenSpend / trailingQual : 0;
            const trailingCpgl =
              trailingGood > 0 ? trailingLeadgenSpend / trailingGood : 0;

            // SS Projection (from skill): use prior 6d good-given-qual rate
            const priorGoodGivenQual = trailingQual > 0 ? trailingGood / trailingQual : 0;
            const projectedExtraGood = ssPendingCount * priorGoodGivenQual;
            const projectedTotalGood = focalGood + projectedExtraGood;
            const projectedGoodRate = focalLeads > 0 ? (projectedTotalGood / focalLeads) * 100 : 0;
            const projectedCpgl =
              projectedTotalGood > 0 ? focalSpendLeadgen / projectedTotalGood : 0;

            // Channel-level 7d comparison
            type ChAgg = { leads: number; qual: number; good: number };
            const focalByChannel = new Map<string, ChAgg>();
            const trailingByChannel = new Map<string, ChAgg>();
            const channelKey = (l: EnrichedLead) =>
              l.channel === 'Cold Leads - Meta' && l.meta_sub_channel
                ? `${l.channel} (${l.meta_sub_channel})`
                : l.channel;
            for (const l of focalDayLeads) {
              const k = channelKey(l);
              const a = focalByChannel.get(k) || { leads: 0, qual: 0, good: 0 };
              a.leads++;
              if (l.is_qualified) a.qual++;
              if (l.is_good) a.good++;
              focalByChannel.set(k, a);
            }
            for (const l of trailingLeads) {
              const k = channelKey(l);
              const a = trailingByChannel.get(k) || { leads: 0, qual: 0, good: 0 };
              a.leads++;
              if (l.is_qualified) a.qual++;
              if (l.is_good) a.good++;
              trailingByChannel.set(k, a);
            }
            const allChannelKeys = new Set<string>([
              ...focalByChannel.keys(),
              ...trailingByChannel.keys(),
            ]);
            const qualityChannels = Array.from(allChannelKeys)
              .filter((k) => k && k !== 'MOF Remarketing' && k !== 'Others') // matches reference exclusion
              .map((k) => {
                const f = focalByChannel.get(k) || { leads: 0, qual: 0, good: 0 };
                const t = trailingByChannel.get(k) || { leads: 0, qual: 0, good: 0 };
                const fQualRate = f.leads > 0 ? (f.qual / f.leads) * 100 : 0;
                const fGoodRate = f.leads > 0 ? (f.good / f.leads) * 100 : 0;
                const tQualRate = t.leads > 0 ? (t.qual / t.leads) * 100 : 0;
                const tGoodRate = t.leads > 0 ? (t.good / t.leads) * 100 : 0;
                return {
                  channel: k,
                  leads: f.leads,
                  qualified: f.qual,
                  good: f.good,
                  qualified_rate: +fQualRate.toFixed(2),
                  good_rate: +fGoodRate.toFixed(2),
                  leads_7d: t.leads,
                  qual_rate_7d: +tQualRate.toFixed(2),
                  good_rate_7d: +tGoodRate.toFixed(2),
                  delta_qual_pp: +(fQualRate - tQualRate).toFixed(2),
                  delta_good_pp: +(fGoodRate - tGoodRate).toFixed(2),
                };
              })
              .sort((a, b) => b.leads - a.leads);

            // 7d rolling daily quality table (date-by-date, focal highlighted)
            const weekdayName = (dateStr: string) => {
              const d = new Date(dateStr + 'T00:00:00Z');
              return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
            };
            const window7Dates = daily_trend.slice(Math.max(0, focalIdx - 6), focalIdx + 1);
            const daily_quality = window7Dates.map((row) => {
              const dayLeads = enriched.filter((l) => dateOf(l) === row.date);
              const q = dayLeads.filter((l) => l.is_qualified).length;
              const g = dayLeads.filter((l) => l.is_good).length;
              const total = dayLeads.length;
              return {
                date: row.date,
                weekday: weekdayName(row.date),
                leads: total,
                qualified: q,
                good: g,
                qualified_rate: total > 0 ? +((q / total) * 100).toFixed(1) : 0,
                good_rate: total > 0 ? +((g / total) * 100).toFixed(1) : 0,
                is_focal: row.date === focalDate,
              };
            });

            // Insight bullets — emoji-led, ready to render
            const insight_bullets: string[] = [];
            if (focalGoodRateQ < trailingGoodRate - 5) {
              const ssNote =
                ssPendingCount > 0
                  ? ` — partly due to ${ssPendingCount} School shortlisting leads awaiting grading.`
                  : '.';
              insight_bullets.push(
                `⚠️ Good Rate well below 7D avg: ${focalGoodRateQ.toFixed(1)}% today vs ${trailingGoodRate.toFixed(1)}% 7D${ssNote}`
              );
            }
            if (ssPendingCount > 0) {
              insight_bullets.push(
                `⏳ ${ssPendingCount} SS leads pending grading — projected to add ~${projectedExtraGood.toFixed(1)} good leads (applying ${(priorGoodGivenQual * 100).toFixed(1)}% prior 6D good-given-qual baseline). Projected good total: ${projectedTotalGood.toFixed(1)} (${projectedGoodRate.toFixed(1)}%).`
              );
            }
            if (focalQualRate < trailingQualRate - 3) {
              insight_bullets.push(
                `⚠️ Qual Rate dropped: ${focalQualRate.toFixed(1)}% vs ${trailingQualRate.toFixed(1)}% 7D — fewer leads reaching support qualification.`
              );
            }
            // Best channel by good rate (with leads >= 5)
            const bestCh = qualityChannels
              .filter((c) => c.leads >= 5 && c.good_rate > 0)
              .sort((a, b) => b.good_rate - a.good_rate)[0];
            if (bestCh) {
              insight_bullets.push(
                `🏆 Best channel: ${bestCh.channel} — ${bestCh.leads} leads, ${bestCh.qualified_rate.toFixed(0)}% qual / ${bestCh.good_rate.toFixed(0)}% good.`
              );
            }
            // Weakest by qual rate (with leads >= 5)
            const weakCh = qualityChannels
              .filter((c) => c.leads >= 5)
              .sort((a, b) => a.qualified_rate - b.qualified_rate)[0];
            if (weakCh && weakCh !== bestCh) {
              insight_bullets.push(
                `📉 Weakest channel (qual): ${weakCh.channel} — ${weakCh.leads} leads, ${weakCh.qualified_rate.toFixed(0)}% qual / ${weakCh.good_rate.toFixed(0)}% good.`
              );
            }
            // Cold Meta callout if present
            const coldMeta = qualityChannels.find((c) => c.channel.startsWith('Cold Leads - Meta'));
            if (coldMeta && coldMeta.leads > 0) {
              insight_bullets.push(
                `📊 Cold Meta: ${coldMeta.leads}L, ${coldMeta.qualified_rate.toFixed(0)}% qual, ${coldMeta.good_rate.toFixed(0)}% good — Δ Good vs 7D: ${coldMeta.delta_good_pp >= 0 ? '+' : ''}${coldMeta.delta_good_pp.toFixed(1)}pp.`
              );
            }

            dashboard.quality = {
              focal_date: focalDate,
              leads: focalLeads,
              qualified: focalQual,
              good: focalGood,
              qualified_rate: +focalQualRate.toFixed(2),
              good_rate: +focalGoodRateQ.toFixed(2),
              cpql: +focalCpql.toFixed(2),
              cpgl: +focalCpgl.toFixed(2),
              spend_leadgen: +focalSpendLeadgen.toFixed(2),
              prev_day: {
                date: prevDate,
                leads: prevDayLeads.length,
                qualified: prevQual,
                good: prevGood,
                cpql: +prevCpql.toFixed(2),
                cpgl: +prevCpgl.toFixed(2),
                spend_leadgen: +prevSpendLeadgen.toFixed(2),
              },
              trailing_7d: {
                leads: trailingTotal,
                qualified: trailingQual,
                good: trailingGood,
                qualified_rate: +trailingQualRate.toFixed(2),
                good_rate: +trailingGoodRate.toFixed(2),
                cpql: +trailingCpql.toFixed(2),
                cpgl: +trailingCpgl.toFixed(2),
                spend_leadgen: +trailingLeadgenSpend.toFixed(2),
              },
              delta_leads_vs_prev: focalLeads - prevDayLeads.length,
              delta_leads_vs_7d_avg: +(focalLeads - trailingAvgLeads).toFixed(1),
              delta_cpql_vs_prev: +(focalCpql - prevCpql).toFixed(2),
              delta_cpql_vs_7d: +(focalCpql - trailingCpql).toFixed(2),
              delta_cpgl_vs_prev: +(focalCpgl - prevCpgl).toFixed(2),
              delta_cpgl_vs_7d: +(focalCpgl - trailingCpgl).toFixed(2),
              delta_qual_pp_vs_7d: +(focalQualRate - trailingQualRate).toFixed(2),
              delta_good_pp_vs_7d: +(focalGoodRateQ - trailingGoodRate).toFixed(2),
              ss_pending_count: ssPendingCount,
              ss_projection: {
                prior_good_given_qual_rate: +priorGoodGivenQual.toFixed(4),
                projected_extra_good: +projectedExtraGood.toFixed(2),
                projected_total_good: +projectedTotalGood.toFixed(2),
                projected_good_rate: +projectedGoodRate.toFixed(2),
                projected_cpgl: +projectedCpgl.toFixed(2),
              },
              channels: qualityChannels,
              daily_quality,
              insight_bullets,
            };
          }

          dashboard.decay = {
            focal_date: focalDate,
            cpl: {
              focal: focalRow.cpl,
              avg_7d: +cpl7.toFixed(2),
              avg_14d: +cpl14.toFixed(2),
              drift_pct_vs_7d: cplDrift,
              alert: cplDrift > 50,
            },
            cpql: {
              focal: focalRow.cpql,
              avg_7d: +cpql7.toFixed(2),
              drift_pct: cpqlDrift,
              alert: cpqlDrift > 50,
            },
            frequency: {
              focal: focalRow.frequency,
              avg_7d: +freq7.toFixed(2),
              velocity_per_day: freqVelocity,
              alert: focalRow.frequency > 3.0 || freqVelocity > 0.05,
            },
            ctr: {
              focal: focalRow.ctr,
              avg_7d: +ctr7.toFixed(2),
              decay_pct: ctrDecay,
              alert: ctrDecay < -25,
            },
            cpm: {
              focal: focalRow.cpm,
              avg_7d: +cpm7.toFixed(2),
              drift_pct: cpmDrift,
              alert: cpmDrift > 30,
            },
            good_rate: {
              focal: focalGoodRate,
              avg_7d: +goodRate7.toFixed(2),
              drop_pp: goodDropPp,
              alert: goodDropPp < -5,
            },
            notes: decayNotes,
          };
        } else {
          notes.push(`focal_date ${focalDate} is outside the date_range; decay not computed.`);
        }
      }
    } catch (e: any) {
      console.warn('[reports] daily-trend / decay failed:', e?.message);
      notes.push(`Daily trend unavailable: ${e?.message || 'unknown'}`);
    }
  }

  if (opts?.includeInsights !== false) {
    try {
      dashboard.insights = await generateMarketingInsight({
        date_range: range,
        totals,
        channels: channels.slice(0, 8),
        meta_lanes,
        google: google_ads,
        top_ads: top_ads.slice(0, 10),
        notes: [...notes, dashboard.decay ? `Decay alerts: ${dashboard.decay.notes.join(' ')}` : '']
          .filter(Boolean)
          .join('; '),
      });
    } catch (e: any) {
      console.warn('[reports] insights generation failed:', e?.message);
    }
  }

  return dashboard;
}

// =============================================================================
// Quality Report (subset of combined)
// =============================================================================

export interface QualityReport {
  date_range: DateRange;
  totals: {
    leads: number;
    qualified: number;
    good: number;
    qualified_rate: number;
    good_rate: number;
    good_to_qual_ratio: number;
  };
  channels: Array<{
    channel: string;
    leads: number;
    qualified: number;
    good: number;
    qualified_rate: number;
    good_rate: number;
  }>;
  stage_distribution: Array<{ stage: string; count: number; pct: number }>;
  insights?: string;
}

export async function buildQualityReport(
  range: DateRange,
  opts?: { includeInsights?: boolean }
): Promise<QualityReport> {
  const dash = await buildVolumeReport(range, { includeInsights: false });
  const totals = {
    leads: dash.totals.leads,
    qualified: dash.totals.qualified,
    good: dash.totals.good,
    qualified_rate: dash.totals.qualified_rate,
    good_rate: dash.totals.good_rate,
    good_to_qual_ratio:
      dash.totals.qualified > 0 ? +((dash.totals.good / dash.totals.qualified) * 100).toFixed(2) : 0,
  };
  const report: QualityReport = {
    date_range: range,
    totals,
    channels: dash.channels.map(({ spend: _spend, cpl: _cpl, ...rest }) => rest),
    stage_distribution: dash.stage_distribution,
  };
  if (opts?.includeInsights !== false) {
    try {
      report.insights = await generateMarketingInsight({
        date_range: range,
        totals,
        channels: report.channels.slice(0, 8),
        notes: 'Quality-only report (no spend data)',
      });
    } catch (e: any) {
      console.warn('[reports] quality insights failed:', e?.message);
    }
  }
  return report;
}

export const KILL_MATRIX = KILL_THRESHOLDS;
