/**
 * MiM Essay CRM API client.
 * Endpoint: https://www.mim-essay.com/external
 * Auth: X-API-Key header
 */
import axios, { AxiosInstance } from 'axios';
import type { MimLead } from './attribution';
import { getCachedLeads, setCachedLeads, getCacheMeta, redis } from './redis';

const BASE_URL = 'https://www.mim-essay.com/external';
const PAGE_SIZE = 200;

function getClient(): AxiosInstance {
  const apiKey = process.env.MIM_ESSAY_API_KEY;
  if (!apiKey) throw new Error('MIM_ESSAY_API_KEY not set');
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 15000, // fail fast and retry
  });
}

interface ListPipelinesResponse {
  data?: Array<{ id: number | string; name: string }>;
  pipelines?: Array<{ id: number | string; name: string }>;
}

interface LeadsResponse {
  success?: boolean;
  data?: MimLead[];
  pagination?: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}

export interface LeadFilters {
  created_after?: string;
  created_before?: string;
  booked_after?: string;
  booked_before?: string;
  stage_id?: number | string;
  source?: string;
  query?: string;
}

export async function listPipelines(): Promise<Array<{ id: number | string; name: string }>> {
  const client = getClient();
  const res = await client.get<ListPipelinesResponse>('/pipelines');
  return res.data.data || res.data.pipelines || [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with retry + exponential backoff for transient 5xx and network errors.
 * Specifically handles 507/503/502/504 which the CRM returns under load.
 */
async function getWithRetry<T>(
  client: AxiosInstance,
  path: string,
  params: Record<string, any>,
  maxAttempts = 3
): Promise<{ data: T } | null> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await client.get<T>(path, { params });
      return { data: res.data };
    } catch (err: any) {
      lastErr = err;
      const status = err?.response?.status;
      const retryable =
        !status || // network error / no response
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        status === 507;
      if (!retryable || attempt === maxAttempts) break;
      // Short exponential backoff: 250ms, 500ms.
      const delay = 250 * Math.pow(2, attempt - 1) + Math.random() * 100;
      await sleep(delay);
    }
  }
  console.warn(
    `[mim-api] ${path} ${JSON.stringify(params)} failed after retries:`,
    lastErr?.response?.status,
    lastErr?.message
  );
  return null;
}

/**
 * Run async tasks with bounded concurrency.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function runOne(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runOne());
  await Promise.all(runners);
  return results;
}

function buildLeadParams(
  pipelineId: number | string,
  page: number,
  filters?: LeadFilters
): Record<string, any> {
  return {
    pipeline_id: pipelineId,
    page,
    count: PAGE_SIZE, // spec: `count`, max 200
    ...(filters?.created_after && { created_after: filters.created_after }),
    ...(filters?.created_before && { created_before: filters.created_before }),
    ...(filters?.booked_after && { booked_after: filters.booked_after }),
    ...(filters?.booked_before && { booked_before: filters.booked_before }),
    ...(filters?.stage_id && { stage_id: filters.stage_id }),
    ...(filters?.source && { source: filters.source }),
    ...(filters?.query && { query: filters.query }),
  };
}

/**
 * Fetch all leads for a given pipeline.
 * Strategy:
 *   1. Fetch page 1 to learn `pagination.last_page`.
 *   2. Fetch pages 2..last_page in parallel with bounded concurrency.
 *
 * Per spec (https://www.mim-essay.com/external/leads): page-size param is `count` (max 200,
 * default 50), date filters are `created_after`/`created_before`/`booked_after`/`booked_before`,
 * pagination metadata is in `pagination.last_page`.
 *
 * The CRM returns nested objects (pipeline, stage); we flatten _pipeline_name for convenience.
 */
async function fetchPipelineLeads(
  pipelineId: number | string,
  pipelineName: string,
  filters?: LeadFilters
): Promise<MimLead[]> {
  const client = getClient();

  // Page 1
  const firstRes = await getWithRetry<LeadsResponse>(
    client,
    '/leads',
    buildLeadParams(pipelineId, 1, filters)
  );
  if (!firstRes) return [];

  const firstBatch = firstRes.data.data || [];
  if (!Array.isArray(firstBatch) || firstBatch.length === 0) return [];

  const all: MimLead[] = [];
  for (const lead of firstBatch) {
    lead._pipeline_name = pipelineName;
    all.push(lead);
  }

  // Determine how many more pages we need.
  let lastPage = firstRes.data.pagination?.last_page ?? 1;
  // Safety cap.
  const MAX_PAGES = 500;
  if (lastPage > MAX_PAGES) lastPage = MAX_PAGES;
  if (lastPage <= 1) return all;

  const remainingPages = Array.from({ length: lastPage - 1 }, (_, i) => i + 2);

  // Fetch remaining pages with low concurrency (3 per pipeline) to avoid
  // overloading the CRM, which has been returning 507 under heavy load.
  const pageResults = await runWithConcurrency(remainingPages, 3, async (page) => {
    const res = await getWithRetry<LeadsResponse>(
      client,
      '/leads',
      buildLeadParams(pipelineId, page, filters)
    );
    return res?.data.data || [];
  });

  for (const batch of pageResults) {
    for (const lead of batch) {
      lead._pipeline_name = pipelineName;
      all.push(lead);
    }
  }

  return all;
}

export interface FetchAllResult {
  leads: MimLead[];
  pipelines_seen: number;
  per_pipeline: Array<{ id: number | string; name: string; count: number }>;
}

/**
 * Fetch ALL leads across ALL pipelines, returning leads + a per-pipeline summary
 * for diagnostics.
 *
 * Concurrency: pipelines run sequentially, pages within each pipeline run 3 at
 * a time. This caps in-flight requests at 3 — conservative but the CRM returned
 * HTTP 507 under more aggressive parallelism.
 *
 * `onPipelineDone` lets the caller persist partial progress (e.g. write to
 * Redis after each pipeline) so a function timeout doesn't lose all data.
 */
export async function fetchAllLeadsWithDiagnostics(
  filters?: LeadFilters,
  onPipelineDone?: (
    pipelineLeads: MimLead[],
    accumulated: MimLead[],
    info: { id: number | string; name: string; count: number; ms: number }
  ) => Promise<void> | void
): Promise<FetchAllResult> {
  const pipelines = await listPipelines();
  console.log(`[mim-api] fetchAll: ${pipelines.length} pipelines, filters=${JSON.stringify(filters)}`);
  const leads: MimLead[] = [];
  const perPipeline: FetchAllResult['per_pipeline'] = [];
  for (const p of pipelines) {
    const t0 = Date.now();
    const pipelineLeads = await fetchPipelineLeads(p.id, p.name, filters);
    const ms = Date.now() - t0;
    leads.push(...pipelineLeads);
    perPipeline.push({ id: p.id, name: p.name, count: pipelineLeads.length });
    console.log(`[mim-api] pipeline "${p.name}" (id=${p.id}): ${pipelineLeads.length} leads in ${ms}ms`);
    if (onPipelineDone) {
      await onPipelineDone(pipelineLeads, leads, { id: p.id, name: p.name, count: pipelineLeads.length, ms });
    }
  }
  return { leads, pipelines_seen: pipelines.length, per_pipeline: perPipeline };
}

export async function fetchAllLeads(filters?: LeadFilters): Promise<MimLead[]> {
  const r = await fetchAllLeadsWithDiagnostics(filters);
  return r.leads;
}

/**
 * On-demand fetch for a date range. Cached in Redis with a short TTL keyed by
 * the from/to/dateField triple so repeated tool calls in quick succession
 * don't hammer the CRM.
 *
 * Replaces the old "cache everything, refresh via cron" model. Each tool call
 * gets exactly the leads it needs (small payload, fast response).
 */
const RANGE_TTL_SECONDS = 30 * 60; // 30 min

export async function fetchLeadsForRange(opts: {
  from: string; // YYYY-MM-DD
  to: string;
  dateField?: 'created_at' | 'booked_at';
}): Promise<{ leads: MimLead[]; source: 'cache' | 'fresh'; pipelines_seen: number }> {
  const dateField = opts.dateField || 'created_at';
  const cacheKey = `mim:range:${dateField}:${opts.from}:${opts.to}`;

  // Try Redis range cache first.
  try {
    const cached = await redis.get<{ leads: MimLead[]; pipelines_seen: number }>(cacheKey);
    if (cached && Array.isArray(cached.leads)) {
      return { leads: cached.leads, source: 'cache', pipelines_seen: cached.pipelines_seen };
    }
  } catch (e: any) {
    console.warn('[mim-api] range cache read failed:', e?.message);
  }

  // Build CRM filter for the requested range.
  const filters: LeadFilters = {};
  if (dateField === 'booked_at') {
    filters.booked_after = opts.from;
    filters.booked_before = opts.to;
  } else {
    filters.created_after = opts.from;
    filters.created_before = opts.to;
  }

  const r = await fetchAllLeadsWithDiagnostics(filters);

  // Cache the result (best-effort, never blocks).
  try {
    await redis.set(cacheKey, { leads: r.leads, pipelines_seen: r.pipelines_seen }, {
      ex: RANGE_TTL_SECONDS,
    });
  } catch (e: any) {
    console.warn('[mim-api] range cache write failed:', e?.message);
  }

  return { leads: r.leads, source: 'fresh', pipelines_seen: r.pipelines_seen };
}

/**
 * Legacy cache-first fetch (kept for backward compat with old tools).
 * New code should use fetchLeadsForRange().
 */
export async function getLeadsCached(): Promise<{
  leads: MimLead[];
  source: 'cache' | 'fresh';
  cache_meta: Awaited<ReturnType<typeof getCacheMeta>>;
}> {
  const cached = await getCachedLeads();
  if (cached && cached.length > 0) {
    const meta = await getCacheMeta();
    return { leads: cached, source: 'cache', cache_meta: meta };
  }
  // Cache miss — fetch a 30-day window so we don't hang.
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const fresh = await fetchAllLeads({ created_after: since.toISOString().slice(0, 10) });
  await setCachedLeads(fresh);
  const meta = await getCacheMeta();
  return { leads: fresh, source: 'fresh', cache_meta: meta };
}

/**
 * Refresh the cache by fetching all leads and overwriting Redis.
 * Called by the cron route. Returns a per-pipeline summary for diagnostics.
 *
 * `days` defaults to 90 — the cron only re-fetches recent leads. This keeps
 * each refresh well under the function timeout. For a one-time historical
 * load, pass a larger window or omit `days` (=> all leads).
 */
export async function refreshLeadCache(opts?: { days?: number | null }): Promise<{
  count: number;
  updated_at: string;
  pipelines_seen: number;
  per_pipeline: FetchAllResult['per_pipeline'];
  filters_used: LeadFilters;
}> {
  const days = opts?.days === undefined ? 30 : opts.days;
  const filters: LeadFilters = {};
  if (days && days > 0) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    filters.created_after = since.toISOString().slice(0, 10);
  }

  // Persist incrementally after each pipeline so a function timeout still
  // leaves a partial cache instead of nothing.
  const r = await fetchAllLeadsWithDiagnostics(filters, async (_pipelineLeads, accumulated) => {
    try {
      await setCachedLeads(accumulated);
    } catch (e: any) {
      console.warn('[refresh] partial cache write failed:', e?.message);
    }
  });
  await setCachedLeads(r.leads);
  const meta = await getCacheMeta();
  return {
    count: r.leads.length,
    updated_at: meta.updated_at || new Date().toISOString(),
    pipelines_seen: r.pipelines_seen,
    per_pipeline: r.per_pipeline,
    filters_used: filters,
  };
}
