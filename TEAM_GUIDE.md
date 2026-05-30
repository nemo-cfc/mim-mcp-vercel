# MiM Essay CRM — Marketing Intelligence (Team Guide)

A shared remote MCP server + web dashboard that joins MiM Essay CRM leads with Meta Ads + Google Ads spend, computes CPL / CPQL / good-rate / lane breakdown, and surfaces decay metrics for daily audits.

This guide is for the marketing & analytics team. **Do not share outside MiM Essay.**

---

## Scope — what this does

| Surface | Use case | Audience |
| --- | --- | --- |
| **Web dashboard** at `/dashboard` | View daily Volume + Quality reports, audit campaigns, spot kill candidates | Sales, ops, leadership, anyone with a browser |
| **MCP connector in Claude.ai** | Ask Claude "show me yesterday's CPL by lane" or "is Cold Meta degrading?" — get joined data answered in chat | Analysts, marketers, anyone who lives in Claude |
| **Admin panel** at `/admin` | Add / remove team members, reset passwords | Whoever owns this deployment (currently Nimesh) |

### What data it covers

- **CRM leads** (live, ~30-min cache) — channel attribution, qualification & good flags from `update_history`, stage distribution, brand filtering (Kraya leads excluded)
- **Meta Ads spend** — direct Graph API (live), per-ad and per-day, with C1-C5 lane classification
- **Google Ads spend** — direct Google Ads API (live), per-campaign daily
- **AI commentary** — Gemini 2.0 Flash generates plain-English summary for each report

### What it computes

- Total leads, total spend, blended CPL, CPQL (cost per qualified lead), CPGL (cost per good lead)
- 14-day daily trend + 7-day rolling tables
- Channel-by-channel performance with Δ vs prev day and vs 7-day average
- Meta lane breakdown (Cold CBO / Remarketing / ThruPlay / Engagement) with status badges
- Top ads ranked by lead volume with WINNER / GOOD / MONITOR / KILL classification
- Decay metrics on the focal day: CPL drift, frequency velocity, CTR decay, CPM drift, good-rate drop
- TOF Attribution Summary with weighted attribution (ManyChat/IG/YT/FB 100%, Google 80%, SEO/Direct 75%)
- SS Projection: projected good-lead total when leads are still at School Shortlisting stage

---

## URLs

```
Web dashboard:  https://mim-mcp-vercel.vercel.app/dashboard
Login:          https://mim-mcp-vercel.vercel.app/login
Admin:          https://mim-mcp-vercel.vercel.app/admin       (admin role required)
MCP endpoint:   https://mim-mcp-vercel.vercel.app/api/mcp?token=<MCP_BEARER_TOKEN>
Status check:   https://mim-mcp-vercel.vercel.app/api/web/auth-status
Repo:           https://github.com/nimeshg-bit/mim-mcp-vercel  (private)
```

---

## Bearer token

The MCP endpoint requires a bearer token — **same token for everyone** on the team.

> **⚠️ DO NOT PASTE THE ACTUAL TOKEN INTO THIS FILE BEFORE SHARING.**
> Replace the placeholder below by hand AFTER reviewing who you're sharing this with.

```
MCP_BEARER_TOKEN=<paste-from-Vercel-env-vars>
```

### How to fetch it (admin only)

1. https://vercel.com/abhyanks-projects/mim-mcp-vercel
2. **Settings → Environment Variables**
3. Find the row literally named `MCP_BEARER_TOKEN`
4. Click 👁️ to reveal → Copy

Identifying the right one:
- 64-character hex string (`[0-9a-f]`)
- Not the Meta token (`EAA…`), not Gemini (`AIza…`), not Pipeboard (`pk_…`)

### Distribution

Send the token to teammates via **1Password / Bitwarden / DM** — not Slack public, not email. Each colleague needs:

1. The bearer token
2. The MCP URL with the token embedded:
   ```
   https://mim-mcp-vercel.vercel.app/api/mcp?token=<MCP_BEARER_TOKEN>
   ```

### Rotation

If the token leaks or someone leaves the team:

```bash
openssl rand -hex 32        # generate new value
```

Then: Vercel → Settings → Env Vars → edit `MCP_BEARER_TOKEN` → paste → Save → Redeploy → re-share with the team.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| **Frontend & API** | Next.js 14 (App Router) + TypeScript |
| **Hosting** | Vercel (Pro plan — uses Vercel Cron, serverless functions) |
| **MCP protocol** | `mcp-handler` npm package (HTTP transport over JSON-RPC) |
| **Storage** | Upstash Redis (via Vercel KV) — range-cached lead queries, user accounts, sessions |
| **Auth (webapp)** | Email + password (scrypt-hashed in Redis), session cookie 30-day |
| **Auth (MCP)** | Bearer token (single shared secret) |
| **CRM** | MiM Essay external API at `mim-essay.com/external` (`X-API-Key`) |
| **Meta Ads** | Direct Graph API v21.0 (`META_ACCESS_TOKEN`) |
| **Google Ads** | Direct Google Ads API v18 (GAQL queries, OAuth refresh token) |
| **AI commentary** | Gemini 2.0 Flash REST API |

Bypassed (kept for legacy / debug only): **Pipeboard** — proved unreliable at the shared-quota layer; replaced with direct vendor APIs.

---

## How to use it — Claude.ai connector

### One-time setup (per teammate)

1. Open https://claude.ai → profile (bottom-left) → **Settings**
2. **Connectors** (left sidebar) → scroll to bottom → **Add custom connector**
3. Fill in:
   - **Name:** `MiM Essay CRM`
   - **Remote MCP server URL:** `https://mim-mcp-vercel.vercel.app/api/mcp?token=<MCP_BEARER_TOKEN>`
   - Leave OAuth fields blank
4. Click **Add**

### Verifying it works

Open a new chat. Make sure the `MiM Essay CRM` connector is toggled **on** for that chat. Then ask:

> Use `get_combined_dashboard` with focal_date 2026-05-05 and date_field "booked_at"

You should get a JSON response with totals, channel breakdown, lane spend, top ads, daily trend, decay metrics.

### Available tools

| Tool | What it returns | Typical use |
| --- | --- | --- |
| **`get_combined_dashboard`** | Full Volume + Quality + decay + lanes + top ads + Gemini insights | **The headline tool** — start here |
| `get_volume_report` | Volume-focused subset (leads + spend + CPL + lane breakdown) | Pure volume / CPL audit |
| `get_quality_report` | Quality-only (qual rate, good rate, stage distribution) | Booking-day quality review |
| `get_leads` | Raw enriched leads filtered by date | Pull a list for export / drill-down |
| `get_channel_matrix` | Channel-level lead / qual / good counts | Quick channel comparison |
| `get_meta_ad_spend` | Raw Meta spend by ad (debug) | Verify Meta numbers |
| `get_google_ads_spend` | Total Google spend (debug) | Verify Google numbers |
| `get_cache_status` | Legacy bulk-cache state | Debugging only |

All tools accept `from`, `to`, `focal_date`, and `date_field` (either `created_at` or `booked_at`).

### Example prompts

> What was the blended CPL on 2026-05-05? Use get_combined_dashboard with that focal_date.

> Use get_quality_report for from 2026-04-28 to 2026-05-05 with date_field booked_at. Which channels had qual rate below 25%? Show me good-lead conversion.

> Pull the top 10 winner ads from the last 7 days using get_combined_dashboard with focal_date 2026-05-05. Sort by good rate.

> Compare Cold CBO and Sandbox lane performance over the past week. Use focal_date 2026-05-05.

> Use get_leads from 2026-05-01 to 2026-05-05 with channel "Cold Leads - Meta" and limit 30. List the top 10 by lead score.

---

## How to use it — Web dashboard

For non-Claude users (or when you just want to look at numbers in a browser):

1. Go to https://mim-mcp-vercel.vercel.app/login
2. Sign in with the email + password you were given
3. Land on `/dashboard`

Use the date picker at the top:
- **Focal date** — the day you're auditing (decay metrics computed for that day)
- **From / To** — usually auto-set to 14 days ending focal day
- **Date field** — toggle between Created at (lead came in) and Booked at (call booked)

The dashboard shows Volume view (top) and Quality view (below), with all sections from the canonical reports.

### Getting an account

Ask **Nimesh** to create one from `/admin`. They'll send you an email + temporary password. You can use the dashboard from any browser, including your phone.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Claude says "Couldn't reach the MCP server" | Bearer token wrong or extra whitespace | Re-fetch from Vercel, no spaces |
| Dashboard shows Meta ₹0 | Meta token expired (60-day TTL) | Admin rotates `META_ACCESS_TOKEN` |
| Dashboard shows Google ₹0 | Google OAuth refresh token expired or revoked | Admin re-runs the Google OAuth flow |
| `/dashboard` redirects to `/login` | Session cookie expired (30-day TTL) | Sign in again |
| "Invalid credentials" on login | Typo, or account doesn't exist yet | Admin creates the account at `/admin` |
| Notes banner says "upstream error" | Specific Meta or Google API issue | The note message tells you which one — show to admin |

If you see something weird that's not listed: screenshot it and DM Nimesh.

---

## Security & operational notes

- **Bearer token is shared.** Anyone with it can call any tool. If a teammate leaves, rotate.
- **Cookie auth is per-person.** Sessions are individually invalidated when someone signs out or is deleted from `/admin`.
- **No PII leaves Vercel.** Leads stay on the Vercel server during a request; only the response JSON travels to clients. Lead emails / phones / names are returned in tool responses, treat as PII.
- **Caching is short.** Lead queries cache for 30 minutes keyed by date range; admin can ignore unless they're debugging. No bulk-data cache that needs warming.
- **Long-running tokens to rotate periodically:**
  - `META_ACCESS_TOKEN` — every ~60 days (or use a System User token for permanence)
  - `GOOGLE_ADS_REFRESH_TOKEN` — only expires if explicitly revoked
  - `MCP_BEARER_TOKEN` — on any team change

---

## Source code & deployment

- **Repo:** https://github.com/nimeshg-bit/mim-mcp-vercel  (private)
- **Vercel project:** https://vercel.com/abhyanks-projects/mim-mcp-vercel
- **Deploys:** auto on every push to `main` (GitHub → Vercel integration)

Build / run locally:

```bash
git clone git@github.com:nimeshg-bit/mim-mcp-vercel.git
cd mim-mcp-vercel
npm install
cp .env.example .env.local      # fill in real values from Vercel
npm run dev                     # http://localhost:3000
```

---

## Owner

Nimesh — nimesh.g@mim-essay.com

For any access requests, token rotations, env var changes, or feature requests, reach Nimesh directly.

---

_Last updated: 2026-05-05_
