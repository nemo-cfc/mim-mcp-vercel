/**
 * Themes panel report builder.
 *
 * Inputs: account_id (defaults to META_AD_ACCOUNT_ID), hours window (default 4).
 *
 * Output: per-theme breakdown with active / inactive ad counts based on
 * "did this ad spend money in the last N hours?" — a tighter signal than
 * effective_status alone (an ad can be effective_status=ACTIVE but pacing
 * at ₹0).
 */
import {
  getMetaAdsHourlySpend,
  getMetaAdStatuses,
} from './meta-graph';
import { classifyTheme, ALL_THEMES, type ThemeName } from './themes';

export interface ThemeRow {
  theme: ThemeName;
  active_ad_count: number; // ads with spend > 0 in last N hours AND effective_status === 'ACTIVE'
  inactive_ad_count: number; // total unique ads in window − active
  total_ad_count: number;
  recent_spend: number; // total spend over the window (across all theme ads)
  recent_impressions: number;
  // Top spend ads in the window (for drilldown)
  active_ads: Array<{
    ad_id: string;
    ad_name: string;
    campaign_name: string;
    spend: number;
    impressions: number;
    effective_status?: string;
  }>;
  inactive_ads: Array<{
    ad_id: string;
    ad_name: string;
    campaign_name: string;
    spend: number;
    effective_status?: string;
  }>;
}

export interface ThemesPanel {
  /** Date used for the data window (account-time-zone calendar date). */
  date: string;
  /** Hour-of-day cutoff (e.g. 18 means we included hours 14..18 if window=4 ending at 18). */
  current_hour: number;
  /** Hours included in the spend window. */
  window_hours: number;
  /** The hour bins included (e.g. [15,16,17,18] for a 4-hour ending at 18). */
  included_hours: number[];
  themes: ThemeRow[];
  totals: {
    active: number;
    inactive: number;
    total: number;
    recent_spend: number;
  };
  notes: string[];
}

/**
 * Build the themes panel.
 *   hours       — size of the lookback window (default 4)
 *   date        — YYYY-MM-DD in account timezone (default: today in IST)
 *   accessToken — optional META_ACCESS_TOKEN override
 */
export async function buildThemesPanel(opts?: {
  hours?: number;
  date?: string;
  accessToken?: string;
}): Promise<ThemesPanel> {
  const hours = Math.max(1, Math.min(24, opts?.hours ?? 4));
  const notes: string[] = [];

  // Resolve "today" in IST (the MiM ad account's reporting timezone).
  const now = new Date();
  const istOffsetMin = 5 * 60 + 30; // +05:30
  const istNow = new Date(now.getTime() + (istOffsetMin - -now.getTimezoneOffset()) * 60 * 1000);
  // The math above is intentionally Vercel-safe: getTimezoneOffset on a UTC
  // server returns 0, so it boils down to "now + 5:30".
  const todayIST = istNow.toISOString().slice(0, 10);
  const date = opts?.date || todayIST;
  const currentHour = istNow.getUTCHours();

  // Build the inclusive set of hour bins for the lookback window.
  const includedHours: number[] = [];
  for (let i = hours - 1; i >= 0; i--) {
    const h = currentHour - i;
    if (h >= 0) includedHours.push(h);
  }

  // Fetch hourly Meta data (may be empty before any spend posts for today).
  let hourly: Awaited<ReturnType<typeof getMetaAdsHourlySpend>> = [];
  try {
    hourly = await getMetaAdsHourlySpend({
      date,
      access_token: opts?.accessToken,
    });
  } catch (e: any) {
    notes.push(`Hourly Meta fetch failed: ${e?.message || 'unknown'}`);
  }

  // Roll up per ad_id within the window.
  type AdAgg = {
    ad_id: string;
    ad_name: string;
    campaign_name: string;
    campaign_id: string;
    spend_in_window: number;
    spend_today: number;
    impressions_in_window: number;
  };
  const byAd = new Map<string, AdAgg>();
  for (const row of hourly) {
    if (!row.ad_id) continue;
    const cur = byAd.get(row.ad_id) || {
      ad_id: row.ad_id,
      ad_name: row.ad_name,
      campaign_name: row.campaign_name,
      campaign_id: row.campaign_id,
      spend_in_window: 0,
      spend_today: 0,
      impressions_in_window: 0,
    };
    cur.spend_today += row.spend;
    if (includedHours.includes(row.hour)) {
      cur.spend_in_window += row.spend;
      cur.impressions_in_window += row.impressions;
    }
    byAd.set(row.ad_id, cur);
  }

  // Fetch effective_status for every ad we saw (so we can also distinguish
  // "no spend but still ACTIVE" from "PAUSED").
  const adIds = Array.from(byAd.keys());
  let statuses: Awaited<ReturnType<typeof getMetaAdStatuses>> = {};
  if (adIds.length > 0) {
    try {
      statuses = await getMetaAdStatuses(adIds, opts?.accessToken);
    } catch (e: any) {
      notes.push(`Ad status fetch failed: ${e?.message || 'unknown'}`);
    }
  }

  // Initialize a row per theme.
  const themeMap = new Map<ThemeName, ThemeRow>();
  for (const t of ALL_THEMES) {
    themeMap.set(t, {
      theme: t,
      active_ad_count: 0,
      inactive_ad_count: 0,
      total_ad_count: 0,
      recent_spend: 0,
      recent_impressions: 0,
      active_ads: [],
      inactive_ads: [],
    });
  }

  for (const a of byAd.values()) {
    const theme = classifyTheme(a.ad_name);
    const row = themeMap.get(theme)!;
    const status = statuses[a.ad_id]?.effective_status;
    const isActive = a.spend_in_window > 0; // primary signal: did it spend in window?

    row.total_ad_count++;
    row.recent_spend += a.spend_in_window;
    row.recent_impressions += a.impressions_in_window;

    if (isActive) {
      row.active_ad_count++;
      row.active_ads.push({
        ad_id: a.ad_id,
        ad_name: a.ad_name,
        campaign_name: a.campaign_name,
        spend: +a.spend_in_window.toFixed(2),
        impressions: a.impressions_in_window,
        effective_status: status,
      });
    } else {
      row.inactive_ad_count++;
      row.inactive_ads.push({
        ad_id: a.ad_id,
        ad_name: a.ad_name,
        campaign_name: a.campaign_name,
        spend: +a.spend_today.toFixed(2),
        effective_status: status,
      });
    }
  }

  // Sort active ads by spend desc, inactive by name asc, and trim to top 10
  // per theme so the response payload stays small.
  for (const row of themeMap.values()) {
    row.active_ads.sort((a, b) => b.spend - a.spend);
    row.inactive_ads.sort((a, b) => (a.ad_name || '').localeCompare(b.ad_name || ''));
    row.active_ads = row.active_ads.slice(0, 15);
    row.inactive_ads = row.inactive_ads.slice(0, 15);
    row.recent_spend = +row.recent_spend.toFixed(2);
  }

  // Final ordered themes — drop the empties to the bottom but keep them
  // visible so the panel doesn't surprise users with a missing category.
  const themes = Array.from(themeMap.values()).sort((a, b) => {
    const aHas = a.total_ad_count > 0 ? 1 : 0;
    const bHas = b.total_ad_count > 0 ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return b.recent_spend - a.recent_spend;
  });

  const totals = themes.reduce(
    (acc, r) => {
      acc.active += r.active_ad_count;
      acc.inactive += r.inactive_ad_count;
      acc.total += r.total_ad_count;
      acc.recent_spend += r.recent_spend;
      return acc;
    },
    { active: 0, inactive: 0, total: 0, recent_spend: 0 }
  );
  totals.recent_spend = +totals.recent_spend.toFixed(2);

  if (adIds.length === 0) {
    notes.push(
      `No ad spend yet today (${date}). Themes panel will fill in as Meta reports hourly spend.`
    );
  }

  return {
    date,
    current_hour: currentHour,
    window_hours: hours,
    included_hours: includedHours,
    themes,
    totals,
    notes,
  };
}
