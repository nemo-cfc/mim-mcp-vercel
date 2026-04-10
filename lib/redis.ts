/**
 * Upstash Redis client + cache helpers.
 * Reads Upstash REST env vars. Supports the default prefix (KV_REST_API_*)
 * and the custom prefix used by this Vercel project (mim_mcp_KV_REST_API_*).
 */
import { Redis } from '@upstash/redis';
import type { MimLead } from './attribution';

const url =
  process.env.KV_REST_API_URL ||
  process.env.mim_mcp_KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN ||
  process.env.mim_mcp_KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  // Don't throw at import time — route handlers will surface a clear error.
  console.warn('[redis] Upstash REST URL/token env vars not set');
}

export const redis = new Redis({
  url: url || '',
  token: token || '',
});

// Cache keys
const LEADS_KEY = 'mim:leads:all';
const LEADS_UPDATED_KEY = 'mim:leads:updated_at';
const LEADS_COUNT_KEY = 'mim:leads:count';

// Upstash has a ~1MB limit per value; split large arrays into chunks.
const CHUNK_SIZE = 2000;

export interface CacheMeta {
  updated_at: string | null;
  count: number;
  age_seconds: number | null;
}

export async function getCacheMeta(): Promise<CacheMeta> {
  const [updatedAt, count] = await Promise.all([
    redis.get<string>(LEADS_UPDATED_KEY),
    redis.get<number>(LEADS_COUNT_KEY),
  ]);
  const ageSeconds = updatedAt
    ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)
    : null;
  return {
    updated_at: updatedAt ?? null,
    count: count ?? 0,
    age_seconds: ageSeconds,
  };
}

export async function getCachedLeads(): Promise<MimLead[] | null> {
  const count = await redis.get<number>(LEADS_COUNT_KEY);
  if (!count || count <= 0) return null;

  const numChunks = Math.ceil(count / CHUNK_SIZE);
  const keys = Array.from({ length: numChunks }, (_, i) => `${LEADS_KEY}:${i}`);
  const chunks = await redis.mget<(MimLead[] | null)[]>(...keys);

  const leads: MimLead[] = [];
  for (const chunk of chunks) {
    if (Array.isArray(chunk)) leads.push(...chunk);
  }
  return leads.length > 0 ? leads : null;
}

export async function setCachedLeads(leads: MimLead[]): Promise<void> {
  // Clear previous chunks (we don't know previous count, so read and delete).
  const prevCount = (await redis.get<number>(LEADS_COUNT_KEY)) ?? 0;
  const prevChunks = Math.ceil(prevCount / CHUNK_SIZE);
  if (prevChunks > 0) {
    const delKeys = Array.from({ length: prevChunks }, (_, i) => `${LEADS_KEY}:${i}`);
    await redis.del(...delKeys);
  }

  // Write new chunks.
  const numChunks = Math.ceil(leads.length / CHUNK_SIZE);
  const pipeline = redis.pipeline();
  for (let i = 0; i < numChunks; i++) {
    const chunk = leads.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    pipeline.set(`${LEADS_KEY}:${i}`, chunk);
  }
  pipeline.set(LEADS_COUNT_KEY, leads.length);
  pipeline.set(LEADS_UPDATED_KEY, new Date().toISOString());
  await pipeline.exec();
}
