/**
 * Optional Amplitude events lookup via the amplitude-analytics MCP.
 *
 * Configured via env vars (both required to enable):
 *   AMPLITUDE_MCP_URL    — JSON-RPC endpoint of the amplitude-analytics MCP
 *   AMPLITUDE_MCP_TOKEN  — bearer token (sent in Authorization header)
 *
 * If either is missing, callers will get null + a note that Amplitude is not
 * configured, instead of an error.
 */
import axios from 'axios';

export interface AmplitudeEventRow {
  event_type?: string;
  event_time?: string;
  user_id?: string;
  device_id?: string;
  event_properties?: Record<string, any>;
  user_properties?: Record<string, any>;
  [key: string]: any;
}

export interface AmplitudeLookupResult {
  configured: boolean;
  events: AmplitudeEventRow[];
  note?: string;
}

export async function fetchAmplitudeEventsForLead(opts: {
  email?: string;
  phone?: string;
  event_type_filter?: string;
}): Promise<AmplitudeLookupResult> {
  const url = process.env.AMPLITUDE_MCP_URL;
  const token = process.env.AMPLITUDE_MCP_TOKEN;

  if (!url || !token) {
    return {
      configured: false,
      events: [],
      note:
        'Amplitude integration not configured (set AMPLITUDE_MCP_URL and AMPLITUDE_MCP_TOKEN env vars).',
    };
  }

  // Try the most likely tool name on the amplitude-analytics MCP.
  // The actual tool we observed earlier was `query_events`. Adjust if the
  // upstream uses a different name.
  const body = {
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1_000_000),
    method: 'tools/call',
    params: {
      name: 'query_events',
      arguments: {
        email: opts.email,
        phone: opts.phone,
        event_type: opts.event_type_filter || 'BAC',
      },
    },
  };

  try {
    const res = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      timeout: 20000,
    });
    if (res.data?.error) {
      return {
        configured: true,
        events: [],
        note: `Amplitude error: ${JSON.stringify(res.data.error)}`,
      };
    }
    const content = res.data?.result?.content;
    if (Array.isArray(content) && content[0]?.type === 'text') {
      try {
        const parsed = JSON.parse(content[0].text);
        const events: AmplitudeEventRow[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.events)
          ? parsed.events
          : Array.isArray(parsed?.data)
          ? parsed.data
          : [];
        return { configured: true, events };
      } catch {
        return { configured: true, events: [], note: 'Amplitude returned non-JSON text.' };
      }
    }
    return { configured: true, events: [] };
  } catch (e: any) {
    console.warn('[amplitude] fetch failed:', e?.message);
    return {
      configured: true,
      events: [],
      note: `Amplitude fetch failed: ${e?.message || 'unknown'}`,
    };
  }
}
