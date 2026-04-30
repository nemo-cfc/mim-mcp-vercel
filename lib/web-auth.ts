/**
 * Server-side helpers for the webapp's cookie-based auth.
 * Reuses MCP_BEARER_TOKEN — no separate secret to manage.
 */
import { cookies } from 'next/headers';

export const AUTH_COOKIE_NAME = 'mim_dashboard_auth';
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function isAuthed(): boolean {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) return false;
  const c = cookies().get(AUTH_COOKIE_NAME);
  return Boolean(c?.value && c.value === expected);
}

export function checkToken(token: string): boolean {
  const expected = process.env.MCP_BEARER_TOKEN;
  return Boolean(expected && token === expected);
}

/**
 * Used by route handlers to set the auth cookie after a successful login.
 */
export function buildAuthCookie(token: string) {
  return {
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}
