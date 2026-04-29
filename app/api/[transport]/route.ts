/**
 * MCP HTTP transport route.
 * Handles /api/mcp (POST) and /api/sse (GET/POST) via mcp-handler.
 * Bearer-token auth via MCP_BEARER_TOKEN (also accepted as ?token= query param).
 */
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { verifyBearer } from '@/lib/auth';
import { fetchLeadsForRange, getLeadsCached } from '@/lib/mim-essay-api';
import { enrichLead, isMimEssayLead } from '@/lib/attribution';
import { filterLeads, buildChannelMatrix, buildDashboard, type DateField } from '@/lib/aggregations';
import { buildVolumeReport, buildQualityReport } from '@/lib/reports';
import { getMetaSpendByAd, getGoogleAdsTotalSpend } from '@/lib/pipeboard';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const dateFieldSchema = z.enum(['created_at', 'booked_at']).default('created_at');

function jsonText(payload: any) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

const handler = createMcpHandler(
  (server) => {
    // =============================================================================
    // Volume + Quality combined dashboard (the headline tool)
    // =============================================================================
    server.tool(
      'get_combined_dashboard',
      'Combined Volume + Quality marketing dashboard for a date range. Joins MiM Essay CRM leads with Meta Ads spend (per ad/lane) and Google Ads spend, computes CPL/CPQL/good-rate, identifies WINNER and KILL ads using the kill matrix, and includes AI-generated commentary. Single source of truth for daily reporting.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
        include_insights: z
          .boolean()
          .optional()
          .default(true)
          .describe('Generate Gemini-written commentary (default true)'),
      },
      async ({ from, to, include_insights }) => {
        const dashboard = await buildVolumeReport({ from, to }, { includeInsights: include_insights });
        return jsonText(dashboard);
      }
    );

    // =============================================================================
    // Volume Report — focuses on leads + spend + CPL
    // =============================================================================
    server.tool(
      'get_volume_report',
      'Lead Volume Report for a date range. Channel-wise lead counts, spend, CPL, and Meta-lane breakdown (C1 Cold / C2 Remarketing / C3 ThruPlay etc). Same data as get_combined_dashboard but optimized for volume reporting.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
        include_insights: z.boolean().optional().default(true),
      },
      async ({ from, to, include_insights }) => {
        const dashboard = await buildVolumeReport({ from, to }, { includeInsights: include_insights });
        // Strip stage_distribution to keep payload small for volume-only consumers.
        const { stage_distribution: _stages, ...rest } = dashboard;
        return jsonText(rest);
      }
    );

    // =============================================================================
    // Quality Report — focuses on qualification + good rates by channel
    // =============================================================================
    server.tool(
      'get_quality_report',
      'Lead Quality Report for a date range. Qualification rate, good lead rate, and stage distribution by channel. No spend data — use get_volume_report or get_combined_dashboard if you need CPL/CPQL.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
        include_insights: z.boolean().optional().default(true),
      },
      async ({ from, to, include_insights }) => {
        const report = await buildQualityReport({ from, to }, { includeInsights: include_insights });
        return jsonText(report);
      }
    );

    // =============================================================================
    // Raw leads — date-range bounded, on-demand
    // =============================================================================
    server.tool(
      'get_leads',
      'Fetch enriched MiM Essay CRM leads filtered by date range. On-demand (no cache reliance). Returns full enriched lead records: channel, quality, UTMs, ad IDs.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
        date_field: dateFieldSchema.describe('Filter by created_at (default) or booked_at'),
        channel: z.string().optional().describe('Optional channel name filter (exact match)'),
        limit: z.number().int().positive().max(2000).optional().describe('Max records to return'),
      },
      async ({ from, to, date_field, channel, limit }) => {
        const { leads, source, pipelines_seen } = await fetchLeadsForRange({
          from,
          to,
          dateField: date_field as DateField,
        });
        const enriched = leads
          .filter(isMimEssayLead)
          .map(enrichLead)
          .filter((l) => {
            const dateVal = date_field === 'booked_at' ? l.booked_at : l.created_at;
            const d = (dateVal || '').slice(0, 10);
            return d >= from && d <= to;
          });
        let filtered = enriched;
        if (channel) filtered = filtered.filter((l) => l.channel === channel);
        const truncated = limit ? filtered.slice(0, limit) : filtered;
        return jsonText({
          count: truncated.length,
          total_matched: filtered.length,
          source,
          pipelines_seen,
          date_range: { from, to },
          date_field,
          leads: truncated,
        });
      }
    );

    // =============================================================================
    // Channel matrix — lighter than the full dashboard
    // =============================================================================
    server.tool(
      'get_channel_matrix',
      'Channel matrix only (channels x volume/qualified/good). On-demand fetch.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
        date_field: dateFieldSchema.describe('Filter by created_at (default) or booked_at'),
      },
      async ({ from, to, date_field }) => {
        const { leads, source } = await fetchLeadsForRange({
          from,
          to,
          dateField: date_field as DateField,
        });
        const filtered = filterLeads(leads, { from, to }, date_field as DateField);
        const matrix = buildChannelMatrix(filtered);
        return jsonText({
          source,
          date_range: { from, to },
          date_field,
          ...matrix,
        });
      }
    );

    // =============================================================================
    // Marketing dashboard — legacy, kept for backward compat
    // =============================================================================
    server.tool(
      'get_marketing_dashboard',
      'Legacy aggregated marketing dashboard (CRM-only, no spend). Prefer get_combined_dashboard for full reports.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
        date_field: dateFieldSchema.describe('Filter by created_at (default) or booked_at'),
      },
      async ({ from, to, date_field }) => {
        const { leads, source } = await fetchLeadsForRange({
          from,
          to,
          dateField: date_field as DateField,
        });
        const dashboard = buildDashboard(leads, { from, to }, date_field as DateField);
        return jsonText({ source, ...dashboard });
      }
    );

    // =============================================================================
    // Spend-only tools (debug / inspection)
    // =============================================================================
    server.tool(
      'get_meta_ad_spend',
      'Raw Meta Ads spend by ad for a date range (Pipeboard upstream). Useful for debugging spend numbers in get_combined_dashboard.',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
      },
      async ({ from, to }) => {
        const ads = await getMetaSpendByAd(from, to);
        const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
        return jsonText({
          date_range: { from, to },
          total_spend: +totalSpend.toFixed(2),
          ad_count: ads.length,
          ads,
        });
      }
    );

    server.tool(
      'get_google_ads_spend',
      'Total Google Ads spend for a date range (Pipeboard upstream).',
      {
        from: z.string().describe('Start date (YYYY-MM-DD)'),
        to: z.string().describe('End date (YYYY-MM-DD)'),
      },
      async ({ from, to }) => {
        const total = await getGoogleAdsTotalSpend(from, to);
        return jsonText({
          date_range: { from, to },
          total_spend: +total.toFixed(2),
        });
      }
    );

    // =============================================================================
    // Cache status — diagnostics for the legacy bulk cache
    // =============================================================================
    server.tool(
      'get_cache_status',
      'Inspect the legacy bulk-leads cache (Redis). The new dashboard tools use a per-date-range cache that is not visible here.',
      {},
      async () => {
        try {
          const r = await getLeadsCached();
          return jsonText({
            count: r.leads.length,
            cache_meta: r.cache_meta,
            source: r.source,
          });
        } catch (e: any) {
          return jsonText({ error: e?.message || 'unknown' });
        }
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
