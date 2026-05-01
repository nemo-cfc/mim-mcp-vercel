/**
 * /api/enrich-lead — webhook endpoint for sale/event-driven lead enrichment.
 *
 * Mirrors the Kraya enrich-lead contract:
 *   POST { email?, phone?, event_id?, event_type?, event_at?, include_amplitude?, amplitude_event_type? }
 *   GET  (no body) -> health-check that echoes the accepted-fields shape
 *
 * Auth: Authorization: Bearer <ENRICH_WEBHOOK_TOKEN>
 *   This is a SEPARATE secret from MCP_BEARER_TOKEN so each consumer can be
 *   rotated independently.
 *
 * Response shape matches the Kraya spec — see /Users/mimessay/Desktop/.../
 *   reference for full doc.
 */
import { NextResponse } from 'next/server';
import { lookupEnrichedLead } from '@/lib/enrich';
import { fetchAmplitudeEventsForLead } from '@/lib/amplitude-events';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function verifyEnrichToken(req: Request): { ok: true } | { ok: false; status: number; body: any } {
  const expected = process.env.ENRICH_WEBHOOK_TOKEN;
  if (!expected) {
    return {
      ok: false,
      status: 500,
      body: { error: 'Server not configured: ENRICH_WEBHOOK_TOKEN missing' },
    };
  }
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m || m[1] !== expected) {
    return { ok: false, status: 401, body: { error: 'Invalid or missing bearer token' } };
  }
  return { ok: true };
}

export async function GET(req: Request) {
  const auth = verifyEnrichToken(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/enrich-lead',
    accepted_fields: {
      email: 'string (optional, one of email/phone)',
      phone: 'string (optional, one of email/phone)',
      event_id: 'string (optional, echoed back)',
      event_type: 'string (optional, echoed back)',
      event_at: 'ISO timestamp (optional, echoed back)',
      include_amplitude: 'boolean (default false; requires AMPLITUDE_MCP_* env vars)',
      amplitude_event_type: 'string (default "BAC", substring filter)',
    },
    response: {
      found: 'boolean',
      match_count: 'number',
      lead: 'object (best match)',
      all_leads: 'array (up to 5 ranked candidates, only when match_count > 1)',
      source: '"cache" | "live"',
      cache_age_seconds: 'number',
      amplitude_events: 'array (only if include_amplitude=true and configured)',
    },
  });
}

export async function POST(req: Request) {
  const auth = verifyEnrichToken(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body?.email === 'string' && body.email.trim() ? body.email.trim() : undefined;
  const phone = typeof body?.phone === 'string' && body.phone.trim() ? body.phone.trim() : undefined;

  if (!email && !phone) {
    return NextResponse.json(
      { error: 'Provide email or phone (at least one)' },
      { status: 400 }
    );
  }

  const event_id = typeof body?.event_id === 'string' ? body.event_id : undefined;
  const event_type = typeof body?.event_type === 'string' ? body.event_type : undefined;
  const event_at = typeof body?.event_at === 'string' ? body.event_at : undefined;
  const include_amplitude = body?.include_amplitude === true;
  const amplitude_event_type =
    typeof body?.amplitude_event_type === 'string' ? body.amplitude_event_type : 'BAC';

  try {
    const lookup = await lookupEnrichedLead({ email, phone });

    // Run optional Amplitude lookup in parallel only when requested.
    let amplitude:
      | Awaited<ReturnType<typeof fetchAmplitudeEventsForLead>>
      | undefined = undefined;
    if (include_amplitude) {
      amplitude = await fetchAmplitudeEventsForLead({
        email,
        phone,
        event_type_filter: amplitude_event_type,
      });
    }

    const baseResponse: Record<string, any> = {
      found: lookup.found,
      match_count: lookup.match_count,
      ...(event_id !== undefined ? { event_id } : {}),
      ...(event_type !== undefined ? { event_type } : {}),
      ...(event_at !== undefined ? { event_at } : {}),
      source: lookup.source,
      cache_age_seconds: lookup.cache_age_seconds,
      searched: { email: email || null, phone: phone || null },
    };

    if (lookup.found) {
      baseResponse.lead = lookup.best;
      if (lookup.all && lookup.all.length > 1) {
        baseResponse.all_leads = lookup.all;
      }
    } else {
      baseResponse.note = 'No MiM Essay lead matches this identifier';
    }

    if (include_amplitude && amplitude) {
      baseResponse.amplitude_events = amplitude.events;
      baseResponse.amplitude_configured = amplitude.configured;
      if (amplitude.note) baseResponse.amplitude_note = amplitude.note;
    }

    return NextResponse.json(baseResponse);
  } catch (e: any) {
    console.error('[enrich-lead] error:', e);
    return NextResponse.json(
      { error: e?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
