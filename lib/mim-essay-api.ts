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

/**
 * Fetch all leads for a given pipeline, paginated.
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
  const all: MimLead[] = [];
  let page = 1;
  let lastPage = 1; // updated from server response after first page
  // Hard cap to prevent runaway loops on malformed responses.
  const MAX_PAGES = 500;

  while (page <= MAX_PAGES) {
    const params: Record<string, any> = {
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

    let res;
    try {
      res = await client.get<LeadsResponse>('/leads', { params });
    } catch (err: any) {
      // Some pipelines may not be accessible — skip silently.
      console.warn(`[mim-api] pipeline ${pipelineId} page ${page} failed:`, err?.message);
      break;
    }

    const batch = res.data.data || [];
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const lead of batch) {
      lead._pipeline_name = pipelineName;
      all.push(lead);
    }

    // Use server-reported pagination if present, else fall back to short-batch check.
    if (res.data.pagination?.last_page) {
      lastPage = res.data.pagination.last_page;
      if (page >= lastPage) break;
    } else if (batch.length < PAGE_SIZE) {
      break;
    }
    page++;
  }

  return all;
}

/**
 * Fetch ALL leads across ALL pipelines.
 * Used by the cron refresh and as fallback when cache is empty.
 */
export async function fetchAllLeads(filters?: LeadFilters): Promise<MimLead[]> {
  const pipelines = await listPipelines();
  const all: MimLead[] = [];

  // Sequential to avoid hammering the CRM API.
  for (const p of pipelines) {
    const leads = await fetchPipelineLeads(p.id, p.name, filters);
    all.push(...leads);
  }

  return all;
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
 * Called by the cron route.
 */
export async function refreshLeadCache(): Promise<{ count: number; updated_at: string }> {
  const fresh = await fetchAllLeads();
  await setCachedLeads(fresh);
  const meta = await getCacheMeta();
  return { count: fresh.length, updated_at: meta.updated_at || new Date().toISOString() };
}
