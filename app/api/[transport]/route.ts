/**
 * MCP HTTP transport route.
 * Handles /api/mcp (POST) and /api/sse (GET/POST) via mcp-handler.
 * Bearer-token auth via MCP_BEARER_TOKEN.
 */
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { verifyBearer } from '@/lib/auth';
import { getLeadsCached } from '@/lib/mim-essay-api';
import { filterLeads, buildChannelMatrix, buildDashboard, type DateField } from '@/lib/aggregations';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const dateFieldSchema = z.enum(['created_at', 'booked_at']).default('created_at');

const handler = createMcpHandler(
  (server) => {
    // ---- Tool 1: get_leads ----
    server.tool(
      'get_leads',
      'Fetch enriched MiM Essay CRM leads filtered by date range. Returns full enriched lead records with channel, quality, UTMs, ad IDs.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
        date_field: dateFieldSchema.describe('Filter by created_at (default) or booked_at'),
        channel: z.string().optional().describe('Optional channel name filter (exact match)'),
        limit: z.number().int().positive().max(2000).optional().describe('Max records to return'),
      },
      async ({ from, to, date_field, channel, limit }) => {
        const { leads, source, cache_meta } = await getLeadsCached();
        let filtered = filterLeads(leads, { from, to }, date_field as DateField);
        if (channel) {
          filtered = filtered.filter((l) => l.channel === channel);
        }
        const truncated = limit ? filtered.slice(0, limit) : filtered;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: truncated.length,
                  total_matched: filtered.length,
                  source,
                  cache_meta,
                  date_range: { from, to },
                  date_field,
                  leads: truncated,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // ---- Tool 2: get_marketing_dashboard ----
    server.tool(
      'get_marketing_dashboard',
      'Get aggregated marketing dashboard with channel-wise totals, qualified/good rates, and quality method breakdown.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
        date_field: dateFieldSchema.describe('Filter by created_at (default) or booked_at'),
      },
      async ({ from, to, date_field }) => {
        const { leads, source, cache_meta } = await getLeadsCached();
        const dashboard = buildDashboard(leads, { from, to }, date_field as DateField);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ source, cache_meta, ...dashboard }, null, 2),
            },
          ],
        };
      }
    );

    // ---- Tool 3: get_channel_matrix ----
    server.tool(
      'get_channel_matrix',
      'Get channel matrix only (channels x volume/qualified/good). Lighter than get_marketing_dashboard.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
        date_field: dateFieldSchema.describe('Filter by created_at (default) or booked_at'),
      },
      async ({ from, to, date_field }) => {
        const { leads, source, cache_meta } = await getLeadsCached();
        const filtered = filterLeads(leads, { from, to }, date_field as DateField);
        const matrix = buildChannelMatrix(filtered);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  source,
                  cache_meta,
                  date_range: { from, to },
                  date_field,
                  ...matrix,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );
  },
  {
    // Server capabilities (defaults are fine)
  },
  {
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: true,
  }
);

// Wrap handler with bearer auth
async function authedHandler(req: Request) {
  const auth = verifyBearer(req);
  if (!auth.ok) return auth.response;
  return handler(req);
}

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
