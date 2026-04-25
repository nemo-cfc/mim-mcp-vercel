/**
 * MiM Essay CRM API client.
 * Endpoint: https://www.mim-essay.com/external
 * Auth: X-API-Key header
 */
import axios, { AxiosInstance } from 'axios';
import type { MimLead } from './attribution';
import { getCachedLeads, setCachedLeads, getCacheMeta } from './redis';

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
    timeout: 30000,
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
  maxAttempts = 4
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
      // Exponential backoff: 500ms, 1s, 2s, 4s, with jitter.
      const delay = 500 * Math.pow(2, attempt - 1) + Math.random() * 250;
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
 */
export async function fetchAllLeadsWithDiagnostics(
  filters?: LeadFilters
): Promise<FetchAllResult> {
  const pipelines = await listPipelines();
  const leads: MimLead[] = [];
  const perPipeline: FetchAllResult['per_pipeline'] = [];
  for (const p of pipelines) {
    const pipelineLeads = await fetchPipelineLeads(p.id, p.name, filters);
    leads.push(...pipelineLeads);
    perPipeline.push({ id: p.id, name: p.name, count: pipelineLeads.length });
  }
  return { leads, pipelines_seen: pipelines.length, per_pipeline: perPipeline };
}

export async function fetchAllLeads(filters?: LeadFilters): Promise<MimLead[]> {
  const r = await fetchAllLeadsWithDiagnostics(filters);
  return r.leads;
}

/**
 * Get leads with cache-first strategy:
 * 1. Try Redis cache
 * 2. If empty/missing, fetch fresh and populate cache
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

  // Cache miss — fetch fresh and store.
  const fresh = await fetchAllLeads();
  await setCachedLeads(fresh);
  const meta = await getCacheMeta();
  return { leads: fresh, source: 'fresh', cache_meta: meta };
}

/**
 * Refresh the cache by fetching all leads and overwriting Redis.
 * Called by the cron route. Returns a per-pipeline summary for diagnostics.
 */
export async function refreshLeadCache(): Promise<{
  count: number;
  updated_at: string;
  pipelines_seen: number;
  per_pipeline: FetchAllResult['per_pipeline'];
}> {
  const r = await fetchAllLeadsWithDiagnostics();
  await setCachedLeads(r.leads);
  const meta = await getCacheMeta();
  return {
    count: r.leads.length,
    updated_at: meta.updated_at || new Date().toISOString(),
    pipelines_seen: r.pipelines_seen,
    per_pipeline: r.per_pipeline,
  };
}
