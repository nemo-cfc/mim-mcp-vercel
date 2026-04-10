/**
 * Bearer token verification for the MCP endpoint.
 * Claude.ai sends: Authorization: Bearer <MCP_BEARER_TOKEN>
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

  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== expected) {
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

  return { ok: true };
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
