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
import { enrichLead, isMimEssayLead, type MimLead, type EnrichedLead } from './attribution';
import { getMetaSpendByAd, getGoogleAdsCampaignMetrics, type MetaInsightRow } from './pipeboard';
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

export interface CombinedDashboard extends VolumeReport {
  stage_distribution: Array<{ stage: string; count: number; pct: number }>;
  insights?: string;
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
  opts?: { includeInsights?: boolean }
): Promise<CombinedDashboard> {
  // Parallelize the three fetches.
  const [crmRes, metaAds, googleRows] = await Promise.all([
    fetchLeadsForRange({ from: range.from, to: range.to, dateField: 'created_at' }),
    getMetaSpendByAd(range.from, range.to).catch((e) => {
      console.warn('[reports] Meta fetch failed:', e?.message);
      return [] as Awaited<ReturnType<typeof getMetaSpendByAd>>;
    }),
    getGoogleAdsCampaignMetrics({ from: range.from, to: range.to }).catch((e) => {
      console.warn('[reports] Google fetch failed:', e?.message);
      return [] as Awaited<ReturnType<typeof getGoogleAdsCampaignMetrics>>;
    }),
  ]);

  // Filter brand + enrich + filter to date range (CRM filter already applied,
  // but be defensive for boundary issues).
  const enriched: Array<EnrichedLead & { ad_id: string | null }> = [];
  for (const lead of crmRes.leads) {
    if (!isMimEssayLead(lead)) continue;
    const e = enrichLead(lead);
    const d = dailyDate(e.created_at);
    if (d < range.from || d > range.to) continue;
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

  // Stage distribution
  const stageCounts = new Map<string, number>();
  for (const l of enriched) {
    stageCounts.set(l.stage, (stageCounts.get(l.stage) || 0) + 1);
  }
  const stage_distribution = Array.from(stageCounts.entries())
    .map(([stage, count]) => ({
      stage,
      count,
      pct: totalLeads > 0 ? +((count / totalLeads) * 100).toFixed(2) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const notes: string[] = [];
  if (crmRes.source === 'cache') notes.push('CRM data served from short-TTL cache.');
  if (metaAds.length === 0) notes.push('Meta Ads spend unavailable for this range.');
  if (googleRows.length === 0) notes.push('Google Ads spend unavailable for this range.');

  const dashboard: CombinedDashboard = {
    date_range: range,
    totals,
    channels,
    meta_lanes,
    top_ads,
    google_ads,
    stage_distribution,
    notes,
  };

  if (opts?.includeInsights !== false) {
    try {
      dashboard.insights = await generateMarketingInsight({
        date_range: range,
        totals,
        channels: channels.slice(0, 8),
        meta_lanes,
        google: google_ads,
        top_ads: top_ads.slice(0, 10),
        notes: notes.join('; '),
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
