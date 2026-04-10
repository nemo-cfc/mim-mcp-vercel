/**
 * Aggregation helpers used by the MCP tools.
 * Channel matrix, marketing dashboard, lead filtering by date.
 */
import { enrichLead, isMimEssayLead, type MimLead, type EnrichedLead } from './attribution';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export type DateField = 'created_at' | 'booked_at';

function inRange(dateStr: string, range: DateRange): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= range.from && d <= range.to;
}

export function filterLeads(
  leads: MimLead[],
  range: DateRange,
  dateField: DateField = 'created_at'
): EnrichedLead[] {
  return leads
    .filter(isMimEssayLead)
    .map(enrichLead)
    .filter((l) => {
      const dateVal = dateField === 'booked_at' ? l.booked_at : l.created_at;
      return inRange(dateVal, range);
    });
}

export interface ChannelStats {
  channel: string;
  total: number;
  qualified: number;
  good: number;
  pending: number;
  qualified_rate: number;
  good_rate: number;
}

export function buildChannelMatrix(leads: EnrichedLead[]): {
  channels: ChannelStats[];
  totals: ChannelStats;
} {
  const byChannel = new Map<string, ChannelStats>();

  for (const lead of leads) {
    const ch = lead.channel || 'Others';
    const key = ch === 'Cold Leads - Meta' && lead.meta_sub_channel ? `${ch} (${lead.meta_sub_channel})` : ch;
    if (!byChannel.has(key)) {
      byChannel.set(key, {
        channel: key,
        total: 0,
        qualified: 0,
        good: 0,
        pending: 0,
        qualified_rate: 0,
        good_rate: 0,
      });
    }
    const row = byChannel.get(key)!;
    row.total++;
    if (lead.is_qualified) row.qualified++;
    if (lead.is_good) row.good++;
    if (lead.is_pending) row.pending++;
  }

  const channels = Array.from(byChannel.values()).sort((a, b) => b.total - a.total);
  for (const row of channels) {
    row.qualified_rate = row.total > 0 ? +(row.qualified / row.total * 100).toFixed(2) : 0;
    row.good_rate = row.total > 0 ? +(row.good / row.total * 100).toFixed(2) : 0;
  }

  const totals: ChannelStats = {
    channel: 'TOTAL',
    total: leads.length,
    qualified: leads.filter((l) => l.is_qualified).length,
    good: leads.filter((l) => l.is_good).length,
    pending: leads.filter((l) => l.is_pending).length,
    qualified_rate: 0,
    good_rate: 0,
  };
  totals.qualified_rate = totals.total > 0 ? +(totals.qualified / totals.total * 100).toFixed(2) : 0;
  totals.good_rate = totals.total > 0 ? +(totals.good / totals.total * 100).toFixed(2) : 0;

  return { channels, totals };
}

export interface DashboardSummary {
  date_range: DateRange;
  date_field: DateField;
  total_leads: number;
  qualified_leads: number;
  good_leads: number;
  pending_leads: number;
  qualified_rate: number;
  good_rate: number;
  channels: ChannelStats[];
  quality_method_breakdown: { update_history: number; stage_fallback: number };
  pre_filter_count: number;
  excluded_by_brand_filter: number;
}

export function buildDashboard(
  allLeads: MimLead[],
  range: DateRange,
  dateField: DateField = 'created_at'
): DashboardSummary {
  const preFilterCount = allLeads.length;
  const mimLeads = allLeads.filter(isMimEssayLead);
  const excluded = preFilterCount - mimLeads.length;

  const enriched = mimLeads.map(enrichLead).filter((l) => {
    const dateVal = dateField === 'booked_at' ? l.booked_at : l.created_at;
    return inRange(dateVal, range);
  });

  const matrix = buildChannelMatrix(enriched);

  const qualityBreakdown = { update_history: 0, stage_fallback: 0 };
  for (const l of enriched) qualityBreakdown[l.quality_method]++;

  return {
    date_range: range,
    date_field: dateField,
    total_leads: matrix.totals.total,
    qualified_leads: matrix.totals.qualified,
    good_leads: matrix.totals.good,
    pending_leads: matrix.totals.pending,
    qualified_rate: matrix.totals.qualified_rate,
    good_rate: matrix.totals.good_rate,
    channels: matrix.channels,
    quality_method_breakdown: qualityBreakdown,
    pre_filter_count: preFilterCount,
    excluded_by_brand_filter: excluded,
  };
}
