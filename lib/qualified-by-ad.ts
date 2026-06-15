/**
 * Qualified-leads-by-ad dashboard data builder.
 *
 * For a given date range, produces a per-ad × per-stage matrix of leads
 * that passed through "Calls today" (broad qualification per guardrails
 * Section 3) and are currently sitting in a stage at or beyond Calls today.
 *
 * Columns shown (in funnel order, all "at or ahead of Calls today"):
 *   Calls today → School shortlisting → Nurturing → 2nd Call Needed →
 *   Attention Needed → Focus leads → Back burner → Pressure sell →
 *   Ultra-hot → Token → Lead won
 *
 * Excluded as columns (negative outcomes — leads that qualified but failed):
 *   Lead lost, No Show, DNP, Cancelled, Deleted, Permanent Delete
 *
 * Per the guardrail rulebook:
 *   - "Qualified" = passed "Calls today" via update_history OR is currently
 *     in any QUALIFIED_STAGES (broad). Source: lib/attribution.ts detectQuality.
 *   - Stages shown are AT or AHEAD of "Calls today" — matches the user's
 *     request: "qualified and moved to any stage ahead of calls today".
 */
import { fetchLeadsForRange } from './mim-essay-api';
import { enrichLead, isMimEssayLead, type EnrichedLead } from './attribution';
import { getMetaAdPreviewUrls, type AdPreviewInfo } from './meta-graph';

/** Stages to display as columns, in funnel order from earliest to closing. */
export const QUALIFIED_STAGE_COLUMNS: string[] = [
  'Calls today',
  'School shortlisting',
  'Nurturing',
  '2nd Call Needed',
  'Attention Needed',
  'Focus leads',
  'Back burner',
  'Pressure sell',
  'Ultra-hot',
  'Token',
  'Lead won',
];

const NORMALIZED_STAGE_COLUMNS = QUALIFIED_STAGE_COLUMNS.map((s) => s.toLowerCase());

function normalizeStage(s: string): string {
  return (s || '').toLowerCase().trim();
}

/** Returns the column-key (canonical-case) for a given stage name, or null
 *  if the stage isn't part of the qualified-progression column set. */
function matchStageColumn(stage: string): string | null {
  const n = normalizeStage(stage);
  const i = NORMALIZED_STAGE_COLUMNS.indexOf(n);
  return i >= 0 ? QUALIFIED_STAGE_COLUMNS[i] : null;
}

export interface QualifiedByAdRow {
  ad_id: string;
  ad_name: string;
  channel: string;
  /** Direct FBCDN .mp4 URL for video ads (signed, ~6-24h validity). Preferred
   *  link target when present. */
  cdn_url: string;
  /** Facebook permalink (/reel/<vid>/ or /post). Stable fallback. */
  preview_url: string;
  preview_cached: boolean;
  thumbnail_url: string;
  video_id: string;
  is_meta: boolean;
  total_qualified: number;
  /** Stage label → count (only columns in QUALIFIED_STAGE_COLUMNS). */
  stages: Record<string, number>;
}

export interface QualifiedByAdReport {
  from: string;
  to: string;
  date_field: 'created_at' | 'booked_at';
  stages: string[]; // ordered column list (= QUALIFIED_STAGE_COLUMNS)
  rows: QualifiedByAdRow[];
  total_qualified: number;
  total_leads_in_window: number;
  unattributed_qualified: number; // qualified leads without an aid (or non-Meta)
  notes: string[];
}

export async function buildQualifiedByAdReport(opts: {
  from: string;
  to: string;
  date_field?: 'created_at' | 'booked_at';
  force_refresh_previews?: boolean;
}): Promise<QualifiedByAdReport> {
  const dateField = opts.date_field || 'created_at';
  const notes: string[] = [];

  // 1. Pull + enrich leads in window
  const { leads } = await fetchLeadsForRange({
    from: opts.from,
    to: opts.to,
    dateField,
  });

  const enriched: EnrichedLead[] = leads
    .filter(isMimEssayLead)
    .map(enrichLead)
    .filter((l) => {
      const d = (dateField === 'booked_at' ? l.booked_at : l.created_at) || '';
      const dDate = d.slice(0, 10);
      return dDate >= opts.from && dDate <= opts.to;
    });

  // 2. Filter to qualified-and-in-a-progression-stage leads
  const qualified = enriched.filter((l) => {
    if (!l.is_qualified) return false;
    const col = matchStageColumn(l.stage);
    return col !== null;
  });

  // 3. Group by ad_id (Meta) OR channel (non-Meta — bucketed as one row each)
  const byAd = new Map<string, QualifiedByAdRow>();
  const unattributed: QualifiedByAdRow = {
    ad_id: '',
    ad_name: '(no ad ID — non-Meta or untagged)',
    channel: 'Unattributed',
    cdn_url: '',
    preview_url: '',
    preview_cached: false,
    thumbnail_url: '',
    video_id: '',
    is_meta: false,
    total_qualified: 0,
    stages: {},
  };

  // Track non-Meta channels separately (ManyChat, Google Ads, SEO/Direct, etc.)
  const byChannel = new Map<string, QualifiedByAdRow>();

  for (const l of qualified) {
    const col = matchStageColumn(l.stage)!;
    const isMeta = l.channel === 'Cold Leads - Meta' || l.channel === 'MOF Remarketing';

    if (isMeta && l.aid) {
      const aid = l.aid;
      let row = byAd.get(aid);
      if (!row) {
        row = {
          ad_id: aid,
          ad_name: l.creative_name || `(ad ${aid})`,
          channel: l.channel,
          cdn_url: '',
          preview_url: '',
          preview_cached: false,
          thumbnail_url: '',
          video_id: '',
          is_meta: true,
          total_qualified: 0,
          stages: {},
        };
        byAd.set(aid, row);
      }
      row.total_qualified++;
      row.stages[col] = (row.stages[col] || 0) + 1;
    } else if (isMeta) {
      // Meta channel but no ad_id — counts toward unattributed
      unattributed.total_qualified++;
      unattributed.stages[col] = (unattributed.stages[col] || 0) + 1;
    } else {
      // Non-Meta channel — group by channel
      const key = l.channel || 'Others';
      let row = byChannel.get(key);
      if (!row) {
        row = {
          ad_id: '',
          ad_name: `(channel: ${key})`,
          channel: key,
          cdn_url: '',
          preview_url: '',
          preview_cached: false,
          thumbnail_url: '',
          video_id: '',
          is_meta: false,
          total_qualified: 0,
          stages: {},
        };
        byChannel.set(key, row);
      }
      row.total_qualified++;
      row.stages[col] = (row.stages[col] || 0) + 1;
    }
  }

  // 4. Resolve preview URLs + names for Meta ads (batched)
  const adIds = Array.from(byAd.keys());
  let previews: Record<string, AdPreviewInfo> = {};
  if (adIds.length > 0) {
    try {
      previews = await getMetaAdPreviewUrls(adIds, {
        force_refresh: opts.force_refresh_previews,
      });
    } catch (err: any) {
      notes.push(`Preview URL fetch failed: ${err?.message || err}`);
    }
  }

  for (const [aid, row] of byAd.entries()) {
    const p = previews[aid];
    if (p) {
      row.cdn_url = p.cdn_url;
      row.preview_url = p.permalink_url;
      row.preview_cached = p.cached;
      row.thumbnail_url = p.thumbnail_url;
      row.video_id = p.video_id;
      if (p.ad_name && p.ad_name.length > 0) row.ad_name = p.ad_name;
    } else {
      row.preview_url = `https://www.facebook.com/ads/library/?id=${aid}`;
    }
  }

  // 5. Build final row list (sorted by total qualified desc, then ad name)
  const allRows: QualifiedByAdRow[] = [
    ...Array.from(byAd.values()),
    ...Array.from(byChannel.values()),
  ];
  if (unattributed.total_qualified > 0) allRows.push(unattributed);
  allRows.sort((a, b) => {
    if (b.total_qualified !== a.total_qualified) return b.total_qualified - a.total_qualified;
    return a.ad_name.localeCompare(b.ad_name);
  });

  const totalQualified = qualified.length;

  return {
    from: opts.from,
    to: opts.to,
    date_field: dateField,
    stages: QUALIFIED_STAGE_COLUMNS,
    rows: allRows,
    total_qualified: totalQualified,
    total_leads_in_window: enriched.length,
    unattributed_qualified: unattributed.total_qualified,
    notes,
  };
}
