/**
 * Lead-enrichment lookup by email / phone.
 * Used by /api/enrich-lead — payment / event webhooks call this to match a
 * sale back to its originating MiM Essay CRM lead so attribution can be
 * stamped on the conversion.
 *
 * Matching rules (mirrors Kraya's enrich-lead spec):
 *   email  → case-insensitive substring match against lead.email
 *   phone  → last-10-digits exact match against lead.phone
 *   if multiple matches, rank by most-recently-updated and return top 5
 */
import { fetchLeadsForRange } from './mim-essay-api';
import { enrichLead, isMimEssayLead, type MimLead, type EnrichedLead } from './attribution';
import { redis } from './redis';

const ENRICH_TTL_SECONDS = 10 * 60; // 10 min — match Kraya's freshness contract

export interface EnrichedMatch {
  id: string | number | undefined;
  name: string;
  email: string;
  phone: string;
  channel: string;
  meta_sub_channel: string;
  stage: string;
  status: 'won' | 'lost' | 'pending';
  pipeline: string;
  created_at: string;
  lead_won_at: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  aid: string;
  caid: string;
  asid: string;
  intent_score: number;
  days_in_pipeline: number;
}

export interface EnrichLookupResult {
  found: boolean;
  match_count: number;
  best?: EnrichedMatch;
  all?: EnrichedMatch[];
  source: 'cache' | 'live';
  cache_age_seconds: number;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Return the last 10 digits of a phone number (strips +, -, spaces, country code). */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}

function matchesEmail(lead: MimLead, q: string): boolean {
  if (!lead.email) return false;
  return String(lead.email).toLowerCase().includes(q);
}

function matchesPhone(lead: MimLead, q10: string): boolean {
  if (!lead.phone) return false;
  return normalizePhone(String(lead.phone)) === q10;
}

function deriveStatus(stageName: string): 'won' | 'lost' | 'pending' {
  const s = stageName.toLowerCase();
  if (s.includes('won') || s.includes('token')) return 'won';
  if (s.includes('lost') || s.includes('cancel') || s.includes('delete') || s.includes('dnp'))
    return 'lost';
  return 'pending';
}

function leadWonAt(lead: MimLead): string {
  // No dedicated field in CRM — fall back to updated_at if stage indicates won.
  const stageName = (lead.stage as any)?.name || (lead.stage as any) || '';
  if (deriveStatus(String(stageName)) === 'won') {
    return String((lead as any).updated_at || (lead as any).booked_at || '');
  }
  return '';
}

function intentScore(enriched: EnrichedLead): number {
  if (enriched.is_good) return 90;
  if (enriched.is_qualified) return 60;
  if (enriched.is_pending) return 30;
  return 10;
}

function daysInPipeline(lead: MimLead): number {
  const created = (lead as any).created_at;
  if (!created) return 0;
  const t = Date.parse(String(created));
  if (Number.isNaN(t)) return 0;
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

function toEnrichedMatch(lead: MimLead): EnrichedMatch {
  const e = enrichLead(lead);
  const stageName = e.stage;
  return {
    id: lead.id,
    name: e.name,
    email: e.email,
    phone: e.phone,
    channel: e.channel,
    meta_sub_channel: e.meta_sub_channel,
    stage: stageName,
    status: deriveStatus(stageName),
    pipeline: e.pipeline,
    created_at: e.created_at,
    lead_won_at: leadWonAt(lead),
    utm_source: e.utm_source,
    utm_medium: e.utm_medium,
    utm_campaign: e.utm_campaign,
    utm_content: e.utm_content,
    aid: e.aid,
    caid: e.caid,
    asid: e.asid,
    intent_score: intentScore(e),
    days_in_pipeline: daysInPipeline(lead),
  };
}

function rank(a: MimLead, b: MimLead): number {
  // Sort by updated_at desc, then created_at desc.
  const ua = String((a as any).updated_at || (a as any).created_at || '');
  const ub = String((b as any).updated_at || (b as any).created_at || '');
  if (ua && ub) return ub.localeCompare(ua);
  if (ub) return 1;
  if (ua) return -1;
  return 0;
}

/**
 * Look up MiM Essay leads matching email or phone.
 * Strategy:
 *   1. Compute cache key from normalized identifier(s).
 *   2. Try Redis enrich-cache (10 min TTL).
 *   3. On miss, fetch last 7 days of leads via the existing on-demand path
 *      (which itself caches the date-range slice for 30 min). Filter +
 *      rank in-memory.
 *   4. If no match in last 7 days and includeLiveBackfill, widen to 30 days.
 *   5. Cache the result and return.
 */
export async function lookupEnrichedLead(opts: {
  email?: string;
  phone?: string;
}): Promise<EnrichLookupResult> {
  const emailQ = opts.email ? normalizeEmail(opts.email) : null;
  const phoneQ = opts.phone ? normalizePhone(opts.phone) : null;

  const cacheKey = `mim:enrich:${emailQ || ''}:${phoneQ || ''}`;
  // Read cache with stamped timestamp for cache_age_seconds.
  type CacheVal = { result: Omit<EnrichLookupResult, 'source' | 'cache_age_seconds'>; stamped_at: string };
  let cached: CacheVal | null = null;
  try {
    cached = await redis.get<CacheVal>(cacheKey);
  } catch (e: any) {
    console.warn('[enrich] cache read failed:', e?.message);
  }

  if (cached?.result) {
    const ageMs = Date.now() - new Date(cached.stamped_at).getTime();
    return {
      ...cached.result,
      source: 'cache',
      cache_age_seconds: Math.max(0, Math.floor(ageMs / 1000)),
    };
  }

  // Live lookup — recent leads first, then widen if nothing found.
  const today = new Date().toISOString().slice(0, 10);
  const last7From = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const last30From = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();

  function findIn(leads: MimLead[]): MimLead[] {
    return leads
      .filter(isMimEssayLead)
      .filter((l) => {
        if (emailQ && matchesEmail(l, emailQ)) return true;
        if (phoneQ && matchesPhone(l, phoneQ)) return true;
        return false;
      })
      .sort(rank);
  }

  let matches: MimLead[] = [];
  try {
    const r7 = await fetchLeadsForRange({ from: last7From, to: today, dateField: 'created_at' });
    matches = findIn(r7.leads);
  } catch (e: any) {
    console.warn('[enrich] last-7d fetch failed:', e?.message);
  }

  if (matches.length === 0) {
    try {
      const r30 = await fetchLeadsForRange({ from: last30From, to: today, dateField: 'created_at' });
      matches = findIn(r30.leads);
    } catch (e: any) {
      console.warn('[enrich] last-30d fetch failed:', e?.message);
    }
  }

  const allMatches = matches.slice(0, 5).map(toEnrichedMatch);
  const result: Omit<EnrichLookupResult, 'source' | 'cache_age_seconds'> = {
    found: allMatches.length > 0,
    match_count: allMatches.length,
    best: allMatches[0],
    all: allMatches.length > 1 ? allMatches : undefined,
  };

  // Cache the result (whether found or not) for 10 minutes.
  try {
    const stamped: CacheVal = { result, stamped_at: new Date().toISOString() };
    await redis.set(cacheKey, stamped, { ex: ENRICH_TTL_SECONDS });
  } catch (e: any) {
    console.warn('[enrich] cache write failed:', e?.message);
  }

  return { ...result, source: 'live', cache_age_seconds: 0 };
}
