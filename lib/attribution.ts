/**
 * Multi-touch attribution for MiM Essay leads.
 * Three-level fallback chain: analytics_source → initial_source JSON → source URL.
 * Ported from /Users/mimessay/webinar page/amplitude-app/mcp-server.mjs
 */

export interface MimLead {
  id?: string | number;
  name?: string;
  phone?: string;
  email?: string;
  stage?: { name?: string } | string;
  source?: string;
  shortened_source?: string;
  analytics_source?: string;
  initial_source?: string;
  initial_source_string?: string;
  update_history?: string | object;
  created_at?: string;
  booked_at?: string;
  pipeline?: { name?: string } | string;
  _pipeline_name?: string;
  _brand?: string;
  [key: string]: any;
}

export interface EnrichedLead {
  id: string | number | undefined;
  name: string;
  phone: string;
  email: string;
  stage: string;
  channel: string;
  meta_sub_channel: string;
  analytics_source: string;
  creative_name: string;
  source: string;
  shortened_source: string;
  initial_source: string;
  created_at: string;
  booked_at: string;
  pipeline: string;
  is_qualified: boolean;
  is_good: boolean;
  is_pending: boolean;
  quality_method: 'update_history' | 'stage_fallback';
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  first_touch_utm_source: string;
  first_touch_utm_medium: string;
  first_touch_utm_content: string;
  first_touch_utm_campaign: string;
  aid: string;
  caid: string;
  asid: string;
}

// ---- Helpers ----

function extractParam(urlStr: string, param: string): string | null {
  const match = String(urlStr || '').match(new RegExp(`${param}=([^&]+)`));
  return match ? match[1] : null;
}

function parseInitialSource(val: unknown): Record<string, any> {
  if (!val || !String(val).trim()) return {};
  try {
    const data = typeof val === 'string' ? JSON.parse(val) : val;
    return typeof data === 'object' && data !== null ? (data as Record<string, any>) : {};
  } catch {
    return {};
  }
}

// ---- Brand filter ----
// The MiM Essay CRM API returns leads from ALL brands (MiM + Kraya + others).
// Filter at two levels: pipeline name AND lead-level signals.
export function isMimEssayLead(lead: MimLead): boolean {
  const pipelineName = (
    (lead.pipeline && typeof lead.pipeline === 'object' ? lead.pipeline.name : lead.pipeline) ||
    lead._pipeline_name ||
    ''
  )
    .toString()
    .toLowerCase()
    .trim();

  // 1. Exclude pipelines that are clearly Kraya
  if (pipelineName.includes('kraya')) return false;

  // 2. Exclude leads where analytics_source signals Kraya brand
  const analyticsRaw = String(lead.analytics_source || lead.shortened_source || '')
    .toLowerCase()
    .trim();
  const analyticsChannelId = analyticsRaw.split('|')[0].trim();
  if (analyticsChannelId === 'kraya' || analyticsChannelId === 'kraya-ai') return false;

  // 3. Exclude leads where source URL points to kraya-ai.com (not mim-essay.com)
  const sourceUrl = String(lead.source || '').toLowerCase();
  if (sourceUrl.includes('kraya-ai.com') && !sourceUrl.includes('mim-essay.com')) return false;

  // 4. Exclude plain-text "kraya" source (Kraya bot leads)
  if (sourceUrl === 'kraya') return false;

  // 5. Accept everything else
  return true;
}

// ---- Level 1: analytics_source (pipe-delimited) ----
function classifyFromAnalyticsSource(analyticsVal: unknown): string | null {
  if (!analyticsVal || !String(analyticsVal).trim()) return null;
  const val = String(analyticsVal).trim().toLowerCase();
  const parts = val.split('|').map((p) => p.trim());

  if (val === 'manychat' || val.includes('manychat')) return 'ManyChat';

  for (const part of parts) {
    if (part === 'meta_mim') return 'Cold Leads - Meta';
    if (part === 'google' || part === 'google-ads') return 'Google Ads';
  }

  const first = parts[0];
  if (first === 'seo' || first === 'organic') return 'SEO / Organic';
  if (first === 'facebook') return 'FB Organic';
  if (first === 'youtube') return 'YouTube';
  if (first === 'linkedin') return 'LinkedIn';
  if (first === 'email') return 'Email';

  if (first === 'mim-essay' || first === 'mim essay') {
    const channel = parts[1] || '';
    if (channel === 'meta_mim') return 'Cold Leads - Meta';
    if (channel === 'google' || channel === 'google-ads') return 'Google Ads';
    if (channel === 'website' || channel === 'organic' || channel === 'seo') return 'SEO / Organic';
    if (channel === 'facebook') return 'FB Organic';
    if (channel === 'instagram') return 'Instagram';
    if (channel === 'youtube') return 'YouTube';
    if (channel === 'linkedin') return 'LinkedIn';
    if (channel === 'email') return 'Email';
    return null;
  }

  if (first === 'instagram') return 'Instagram';
  return null;
}

// ---- Level 2: initial_source JSON ----
function classifyFromInitialSource(initialSourceVal: unknown): string | null {
  const data = parseInitialSource(initialSourceVal);
  if (!data || Object.keys(data).length === 0) return null;

  const utmSource = String(data.utm_source || '').toLowerCase();
  const utmMedium = String(data.utm_medium || '').toLowerCase();
  const referringDomain = String(data.referring_domain || '').toLowerCase();

  if (utmSource.includes('manychat') || utmMedium.includes('manychat')) return 'ManyChat';

  if (utmSource === 'meta_mim') {
    if (utmMedium === 'cold' || utmMedium === 'sandbox') return 'Cold Leads - Meta';
    if (['remarketing', 'retargeting', 'website', 'revival'].includes(utmMedium)) {
      return 'MOF Remarketing';
    }
    return 'Cold Leads - Meta';
  }

  if (utmSource === 'google' || utmSource.includes('google-ads')) return 'Google Ads';

  if (!utmSource) {
    if (referringDomain.includes('facebook.com')) return 'FB Organic';
    if (referringDomain.includes('instagram.com')) return 'Instagram';
    if (referringDomain.includes('youtube.com')) return 'YouTube';
    if (referringDomain.includes('linkedin.com')) return 'LinkedIn';
  }

  return null;
}

// ---- Level 3: source URL (last-touch fallback) ----
function classifyFromSource(sourceVal: unknown): string {
  if (!sourceVal || !String(sourceVal).trim()) return 'Others';
  const source = String(sourceVal).trim().toLowerCase();

  if (source === 'whatsapp') return 'MOF Remarketing';
  if (source === 'manychat') return 'ManyChat';

  const utmSource = extractParam(source, 'utm_source');
  const utmMedium = extractParam(source, 'utm_medium');

  if (utmSource === 'meta_mim' && utmMedium === 'cold') return 'Cold Leads - Meta';
  if (utmSource === 'meta_mim' && utmMedium === 'sandbox') return 'Cold Leads - Meta';
  if (
    utmSource === 'meta_mim' &&
    ['remarketing', 'retargeting', 'website', 'revival'].includes(utmMedium || '')
  ) {
    return 'MOF Remarketing';
  }
  if (utmSource === 'meta_mim') return 'Cold Leads - Meta';
  if (source.includes('google-ads') || utmSource === 'google') return 'Google Ads';
  if (utmSource === 'website' && utmMedium === 'organic') return 'SEO / Organic';

  return 'Others';
}

// ---- Combined channel classifier ----
export function classifyChannel(lead: MimLead): string {
  const analyticsSource = lead.analytics_source || lead.shortened_source || '';
  const initialSource = lead.initial_source_string || lead.initial_source || '';
  const source = lead.source || '';

  // Priority 0: ManyChat check across ALL fields
  const fields: (keyof MimLead)[] = [
    'analytics_source',
    'shortened_source',
    'initial_source_string',
    'initial_source',
    'source',
  ];
  if (fields.some((f) => String(lead[f] || '').toLowerCase().includes('manychat'))) {
    return 'ManyChat';
  }

  // Level 1
  const fromAnalytics = classifyFromAnalyticsSource(analyticsSource);
  if (fromAnalytics) {
    if (fromAnalytics === 'Cold Leads - Meta') {
      const initialData = parseInitialSource(initialSource);
      const utmMedium = String(initialData.utm_medium || '').toLowerCase();
      if (['remarketing', 'retargeting', 'website', 'revival'].includes(utmMedium)) {
        return 'MOF Remarketing';
      }
    }
    return fromAnalytics;
  }

  // Level 2
  const fromInitial = classifyFromInitialSource(initialSource);
  if (fromInitial) return fromInitial;

  // Level 3
  return classifyFromSource(source) || 'Others';
}

// ---- Meta sub-channel (C7 Cold CBO vs C8 Sandbox) ----
export function getMetaSubChannel(lead: MimLead): string {
  const data = parseInitialSource(lead.initial_source_string || lead.initial_source || '');
  const utmMedium = String(data.utm_medium || '').toLowerCase();
  if (utmMedium === 'sandbox') return 'Sandbox (C8)';
  if (utmMedium === 'cold') return 'Cold CBO (C7)';
  return 'Meta (Unclassified)';
}

// ---- Ad-level IDs ----
export function extractAdIds(lead: MimLead): { aid: string | null; caid: string | null; asid: string | null } {
  const data = parseInitialSource(lead.initial_source_string || lead.initial_source || '');
  const urlInJson = String(data.url || '');
  const source = String(lead.source || '');
  return {
    aid: extractParam(urlInJson, 'aid') || extractParam(source, 'aid') || data.aid || null,
    caid: extractParam(urlInJson, 'caid') || extractParam(source, 'caid') || data.caid || null,
    asid: extractParam(urlInJson, 'asid') || extractParam(source, 'asid') || data.asid || null,
  };
}

// ---- Creative name extraction ----
export function extractCreativeName(lead: MimLead): string {
  const analytics = String(lead.analytics_source || lead.shortened_source || '').trim();
  if (analytics.includes('|')) {
    const parts = analytics.split('|', 2);
    if (parts[1] && parts[1].trim()) return parts[1].trim();
  }
  const data = parseInitialSource(lead.initial_source_string || lead.initial_source || '');
  if (data.utm_content) return String(data.utm_content);
  return extractParam(lead.source || '', 'utm_content') || '';
}

// ---- Display analytics_source ----
export function resolveAnalyticsSource(lead: MimLead): string {
  if (lead.analytics_source && String(lead.analytics_source).trim()) {
    return String(lead.analytics_source).trim().toLowerCase();
  }
  if (lead.shortened_source && String(lead.shortened_source).trim()) {
    const val = String(lead.shortened_source).trim().toLowerCase();
    const parts = val.split('|');
    if (parts.length >= 2 && parts[1]) return parts[0] + '|' + parts[1];
    return parts[0];
  }
  const data = parseInitialSource(lead.initial_source_string || lead.initial_source || '');
  if (data.utm_source) return String(data.utm_source).toLowerCase();
  const src = String(lead.source || '').toLowerCase();
  if (src === 'manychat') return 'manychat';
  if (src === 'whatsapp' || src === 'whatsapp-api') return 'whatsapp';
  const utmSrc = extractParam(src, 'utm_source');
  if (utmSrc) return utmSrc;
  if (data.referring_domain) {
    const domain = String(data.referring_domain).toLowerCase();
    if (domain.includes('facebook')) return 'facebook';
    if (domain.includes('instagram')) return 'instagram';
    if (domain.includes('google')) return 'google';
    if (domain.includes('youtube')) return 'youtube';
    if (domain.includes('linkedin')) return 'linkedin';
  }
  return 'direct';
}

// ---- Quality detection ----
const QUALIFIED_STAGES = new Set([
  'calls today',
  'school shortlisting',
  'nurturing',
  '2nd call needed',
  'attention needed',
  'focus leads',
  'pressure sell',
  'ultra-hot',
  'token',
  'lead won',
  'lead lost',
  'no show',
  'dnp',
  'back burner',
]);

const GOOD_STAGES = new Set(['pressure sell', 'ultra-hot', 'token', 'lead won']);

const PENDING_STAGES = new Set(['call booked', 'request received']);

// ---- Stage categories (for the Quality dashboard's stage table) ----
export type StageCategory =
  | 'PENDING'
  | 'HIGH_INTENT'
  | 'SUPPORT_QUAL'
  | 'SALES_QUAL'
  | 'OUTCOME_WON'
  | 'OUTCOME_LOST'
  | 'DISQUALIFIED'
  | 'CONTACT_FAILED'
  | 'OTHER';

const STAGE_CATEGORY_MAP: Record<string, StageCategory> = {
  // PENDING — lead came in, not yet contacted
  'call booked': 'PENDING',
  'request received': 'PENDING',

  // SUPPORT_QUAL — connected with support
  'calls today': 'SUPPORT_QUAL',
  'review': 'SUPPORT_QUAL',

  // SALES_QUAL — moved into sales nurture
  'school shortlisting': 'SALES_QUAL',
  'nurturing': 'SALES_QUAL',
  '2nd call needed': 'SALES_QUAL',
  'attention needed': 'SALES_QUAL',
  'focus leads': 'SALES_QUAL',
  'back burner': 'SALES_QUAL',

  // HIGH_INTENT — hot leads close to closing
  'pressure sell': 'HIGH_INTENT',
  'ultra-hot': 'HIGH_INTENT',
  'token': 'HIGH_INTENT',

  // OUTCOMES
  'lead won': 'OUTCOME_WON',
  'lead lost': 'OUTCOME_LOST',

  // CONTACT_FAILED — couldn't connect
  'no show': 'CONTACT_FAILED',
  'dnp': 'CONTACT_FAILED',

  // DISQUALIFIED — manual reject
  'deleted': 'DISQUALIFIED',
  'cancelled': 'DISQUALIFIED',
  'permanent delete': 'DISQUALIFIED',
};

export function categorizeStage(stageName: string): StageCategory {
  const key = (stageName || '').toLowerCase().trim();
  return STAGE_CATEGORY_MAP[key] || 'OTHER';
}

// ===========================================================================
// FRESH LEAD FILTER — excludes referrals + lead-lost-returns from Volume Report
// (matches the canonical mim-essay-volume-report skill's totals exclusions)
// ===========================================================================

/**
 * "Fresh" lead = brand-matched MiM Essay lead AND not a referral AND not a
 * sales-team reactivation of an old "Lead Lost" lead. Used by the Volume
 * Report to compute Total Leads / Total Spend / Overall CPL.
 */
export function isFreshLead(lead: MimLead): boolean {
  if (!isMimEssayLead(lead)) return false;
  const analyticsRaw = String(lead.analytics_source || lead.shortened_source || '')
    .toLowerCase()
    .trim();
  // analytics_source = 'referral' (operations referrals)
  if (analyticsRaw === 'referral' || analyticsRaw.startsWith('referral|')) return false;
  // source or initial_source contains "lead lost return" (sales reactivations)
  const allSource = `${lead.source || ''} ${lead.initial_source || ''} ${lead.initial_source_string || ''}`.toLowerCase();
  if (allSource.includes('lead lost return') || allSource.includes('lead-lost-return')) return false;
  return true;
}

// ===========================================================================
// TOF ATTRIBUTION WEIGHTS
// (matches the canonical mim-essay-volume-report skill's TOF v2.1 framework)
// ===========================================================================

/** Maps a channel name (as classified) to its TOF attribution weight (0-1). */
export function tofWeightForChannel(channel: string): number | null {
  const c = (channel || '').trim();
  if (c === 'ManyChat') return 1.0;
  if (c === 'Instagram') return 1.0;
  if (c === 'YouTube') return 1.0;
  if (c === 'FB Organic') return 1.0;
  if (c === 'Google Ads') return 0.8;
  if (c === 'SEO / Organic') return 0.75;
  // 'Direct' is also TOF-attributable per skill, but we don't classify a
  // separate 'Direct' channel in attribution.ts. Combine with SEO/Organic.
  return null; // Channel doesn't qualify for TOF attribution
}

export function detectQuality(
  lead: MimLead,
  stageName: string
): { isQualified: boolean; isGood: boolean; isPending: boolean; method: 'update_history' | 'stage_fallback' } {
  const stageNameLower = (stageName || '').toLowerCase().trim();
  let isQualified = false;
  let isGood = false;
  const isPending = PENDING_STAGES.has(stageNameLower);

  if (lead.update_history) {
    const histText =
      typeof lead.update_history === 'string' ? lead.update_history : JSON.stringify(lead.update_history);
    if (histText && histText.length > 2) {
      isQualified = histText.includes('Calls today');
      isGood = /Pressure [Ss]ell|Ultra-hot|Token|Lead[- ]won/i.test(histText);
      return { isQualified, isGood, isPending, method: 'update_history' };
    }
  }

  isQualified = QUALIFIED_STAGES.has(stageNameLower);
  isGood = GOOD_STAGES.has(stageNameLower);
  return { isQualified, isGood, isPending, method: 'stage_fallback' };
}

// ---- Full enrichment ----
export function enrichLead(lead: MimLead): EnrichedLead {
  const channel = classifyChannel(lead);
  const analyticsSource = resolveAnalyticsSource(lead);
  const initialData = parseInitialSource(lead.initial_source_string || lead.initial_source || '');

  const ftUtmSource = String(initialData.utm_source || '');
  const ftUtmMedium = String(initialData.utm_medium || '');
  const ftUtmCampaign = String(initialData.utm_campaign || '');
  const ftUtmContent = String(initialData.utm_content || '');

  const sourceUrl = lead.source || '';
  const ltUtmSource = extractParam(sourceUrl, 'utm_source') || '';
  const ltUtmMedium = extractParam(sourceUrl, 'utm_medium') || '';
  const ltUtmCampaign = extractParam(sourceUrl, 'utm_campaign') || '';
  const ltUtmContent = extractParam(sourceUrl, 'utm_content') || '';

  let utmSource = ftUtmSource || ltUtmSource;
  let utmMedium = ftUtmMedium || ltUtmMedium;
  let utmCampaign = ftUtmCampaign || ltUtmCampaign;
  let utmContent = ftUtmContent || ltUtmContent;

  if (!utmSource && lead.shortened_source && lead.shortened_source.includes('|')) {
    const parts = lead.shortened_source.split('|');
    if (parts.length > 2 && parts[1]) {
      utmSource = utmSource || parts[1] || '';
      utmMedium = utmMedium || parts[2] || '';
      utmCampaign = utmCampaign || parts[3] || '';
      utmContent = utmContent || (parts.length > 6 ? parts[6] : parts[4] || '');
    }
  }

  const adIds = extractAdIds(lead);
  const creativeName = extractCreativeName(lead);
  const metaSubChannel = channel === 'Cold Leads - Meta' ? getMetaSubChannel(lead) : '';

  const stageName =
    (lead.stage && (typeof lead.stage === 'object' ? lead.stage.name : lead.stage)) || 'Unknown';
  const quality = detectQuality(lead, stageName);

  return {
    id: lead.id,
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    stage: stageName,
    channel,
    meta_sub_channel: metaSubChannel,
    analytics_source: analyticsSource,
    creative_name: creativeName,
    source: lead.source || '',
    shortened_source: lead.shortened_source || '',
    initial_source: lead.initial_source_string || lead.initial_source || '',
    created_at: lead.created_at || '',
    booked_at: lead.booked_at || '',
    pipeline:
      lead._pipeline_name ||
      (typeof lead.pipeline === 'object' ? lead.pipeline?.name : lead.pipeline) ||
      '',
    is_qualified: quality.isQualified,
    is_good: quality.isGood,
    is_pending: quality.isPending,
    quality_method: quality.method,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    first_touch_utm_source: ftUtmSource,
    first_touch_utm_medium: ftUtmMedium,
    first_touch_utm_content: ftUtmContent,
    first_touch_utm_campaign: ftUtmCampaign,
    aid: adIds.aid || '',
    caid: adIds.caid || '',
    asid: adIds.asid || '',
  };
}
