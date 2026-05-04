/**
 * Web auth helpers — session-cookie + user-role based.
 *
 * The webapp (/dashboard, /admin) uses email+password login; user records and
 * sessions live in Redis (see lib/users.ts). The MCP HTTP transport endpoint
 * (/api/mcp) is unaffected — it still verifies MCP_BEARER_TOKEN.
 */
import { cookies } from 'next/headers';
import { authenticateRequest, SESSION_COOKIE_NAME, type User } from './users';

export { SESSION_COOKIE_NAME };

/** Returns the authenticated user or null. Requires Redis. */
export async function getCurrentUser(): Promise<User | null> {
  const c = cookies().get(SESSION_COOKIE_NAME);
  return authenticateRequest(c?.value);
}

export async function isAuthed(): Promise<boolean> {
  return Boolean(await getCurrentUser());
}

export async function isAdmin(): Promise<boolean> {
  const u = await getCurrentUser();
  return Boolean(u && u.role === 'admin');
}
