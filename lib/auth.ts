/**
 * Token verification for the MCP endpoint.
 * Accepts token via either:
 *   1. Authorization: Bearer <MCP_BEARER_TOKEN>  (curl, programmatic clients)
 *   2. ?token=<MCP_BEARER_TOKEN> query param      (Claude.ai custom connector,
 *      which only supports OAuth or no-auth — so we embed the token in the URL)
 */
export function verifyBearer(req: Request): { ok: true } | { ok: false; response: Response } {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Server not configured: MCP_BEARER_TOKEN missing' }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      ),
    };
  }

  // Check Authorization header
  const authHeader = req.headers.get('authorization') || '';
  const headerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (headerMatch && headerMatch[1] === expected) {
    return { ok: true };
  }

  // Check ?token= query param
  try {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get('token');
    if (queryToken && queryToken === expected) {
      return { ok: true };
    }
  } catch {
    // ignore URL parse errors
  }

  return {
    ok: false,
    response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer',
      },
    }),
  };
}

/**
 * Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
 * Also allow the same MCP_BEARER_TOKEN for manual refresh triggers.
 */
export function verifyCron(req: Request): { ok: true } | { ok: false; response: Response } {
  const cronSecret = process.env.CRON_SECRET;
  const mcpToken = process.env.MCP_BEARER_TOKEN;
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided = match ? match[1] : null;

  if (provided && (provided === cronSecret || provided === mcpToken)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  };
}
