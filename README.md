# MiM Essay MCP Server (Remote / Vercel)

A remote MCP (Model Context Protocol) server for MiM Essay CRM analytics, deployed on Vercel.
Connects to Claude.ai as a Custom Connector — accessible from any device.

## Architecture

- **Next.js 14 App Router** + TypeScript
- **`mcp-handler`** package — MCP HTTP transport
- **Upstash Redis** (via Vercel KV) — shared cache across serverless invocations
- **Vercel Cron** — refreshes the lead cache every 30 minutes
- **Bearer token auth** — protects the MCP endpoint

## Tools exposed

| Tool | Description |
| --- | --- |
| `get_leads` | Enriched MiM Essay leads filtered by date range — full records with channel, quality, UTMs, ad IDs |
| `get_marketing_dashboard` | Channel-wise totals + qualified/good rates + quality method breakdown |
| `get_channel_matrix` | Channel matrix only (lighter than dashboard) |

All tools use the multi-touch attribution chain: `analytics_source` → `initial_source` JSON → `source` URL, with brand filtering (excludes Kraya leads) and quality detection from `update_history`.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create Vercel project

```bash
npx vercel link
```

### 3. Add Vercel KV (Upstash Redis)

In the Vercel dashboard:

1. Open your project → **Storage** tab → **Create Database** → **Upstash KV**
2. Connect it to this project — Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`

### 4. Set environment variables

```bash
# Generate two random secrets
openssl rand -hex 32   # use for MCP_BEARER_TOKEN
openssl rand -hex 32   # use for CRON_SECRET

# Add to Vercel
vercel env add MIM_ESSAY_API_KEY production    # MiM Essay CRM API key
vercel env add MCP_BEARER_TOKEN production     # bearer token for Claude
vercel env add CRON_SECRET production          # cron auth secret
```

For local dev, copy `.env.example` to `.env.local` and fill in values.

### 5. Deploy

```bash
vercel deploy --prod
```

Your MCP endpoint will be: `https://<your-project>.vercel.app/api/mcp`

### 6. Pre-warm the cache

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-project>.vercel.app/api/refresh
```

You should get back `{"ok": true, "count": <N>, "updated_at": "..."}`.

After this, the Vercel Cron will keep the cache warm every 30 minutes automatically.

## Connect to Claude.ai

1. Open Claude.ai → **Settings** → **Connectors** → **Add custom connector**
2. **Name**: `MiM Essay CRM`
3. **URL**: `https://<your-project>.vercel.app/api/mcp`
4. **Authentication**: Bearer token
5. **Token**: paste your `MCP_BEARER_TOKEN` value
6. Save → enable in any chat

You can now ask Claude things like:
> Create a lead volume report for leads generated on April 7th

…from any device signed into your Claude account.

## Local development

```bash
cp .env.example .env.local
# fill in MIM_ESSAY_API_KEY, MCP_BEARER_TOKEN, KV_REST_API_URL, KV_REST_API_TOKEN
npm run dev
```

Test the MCP endpoint locally:

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $MCP_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Files

```
mim-mcp-vercel/
├── app/
│   ├── api/
│   │   ├── [transport]/route.ts   # MCP HTTP handler (3 tools, bearer auth)
│   │   └── refresh/route.ts        # Cron refresh endpoint
│   ├── layout.tsx
│   └── page.tsx                    # Landing page
├── lib/
│   ├── attribution.ts              # Three-level attribution chain + brand filter
│   ├── aggregations.ts             # Dashboard / channel matrix builders
│   ├── mim-essay-api.ts            # CRM client with cache-first reads
│   ├── redis.ts                    # Upstash Redis chunked cache
│   └── auth.ts                     # Bearer / cron auth
├── .env.example
├── next.config.mjs
├── package.json
├── tsconfig.json
└── vercel.json                     # Cron config + function timeouts
```

## How attribution works

Each lead is run through `enrichLead()` which classifies the channel via three levels of fallback:

1. **Level 0 — ManyChat**: any field containing `manychat` → `ManyChat`
2. **Level 1 — `analytics_source`** (pipe-delimited, e.g. `mim-essay|meta_mim`)
3. **Level 2 — `initial_source`** (JSON with `utm_source`, `utm_medium`, `referring_domain`)
4. **Level 3 — `source` URL** (last-touch fallback parsing UTM params)

`Cold Leads - Meta` is sub-classified as **Cold CBO (C7)** or **Sandbox (C8)** based on `utm_medium`.

Quality detection is two-method:
- **Primary**: parse `update_history` text — `Calls today` → qualified, `Pressure Sell|Ultra-hot|Token|Lead won` → good
- **Fallback**: stage name matching (`QUALIFIED_STAGES`, `GOOD_STAGES`)

Brand filter excludes leads where:
- pipeline name contains `kraya`
- `analytics_source` channel id is `kraya` / `kraya-ai`
- `source` URL contains `kraya-ai.com`
- `source` is plain text `kraya`
