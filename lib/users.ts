/**
 * User model + session management for the webapp.
 *
 * Storage: Upstash Redis. Two key shapes:
 *   user:<email>     -> JSON { email, password_hash, salt, role, created_at, last_login }
 *   session:<id>     -> email (TTL 30 days)
 *   users            -> SET of all email addresses
 *
 * Auth flow:
 *   1. /login form submits {email, password}
 *   2. /api/web/auth POST hashes password, compares to user.password_hash
 *   3. On match, generates random session ID, stores session:<id> -> email,
 *      sets httpOnly cookie 'mim_dashboard_session' = <id>
 *   4. Subsequent requests look up session ID -> email -> user
 *
 * MCP endpoint (/api/mcp) is NOT affected — it keeps using MCP_BEARER_TOKEN.
 */
import { redis } from './redis';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

export type UserRole = 'admin' | 'user';

export interface User {
  email: string;
  password_hash: string; // hex
  salt: string; // hex
  role: UserRole;
  created_at: string;
  last_login?: string;
}

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// =============================================================================
// Password hashing — Node scrypt
// =============================================================================

const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  const buf = await scrypt(password, salt, SCRYPT_KEYLEN);
  return { hash: buf.toString('hex'), salt: salt.toString('hex') };
}

export async function verifyPassword(
  password: string,
  hashHex: string,
  saltHex: string
): Promise<boolean> {
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// =============================================================================
// User CRUD
// =============================================================================

function userKey(email: string): string {
  return `user:${email.toLowerCase().trim()}`;
}

export async function getUser(email: string): Promise<User | null> {
  const u = await redis.get<User>(userKey(email));
  return u || null;
}

export async function listUsers(): Promise<User[]> {
  const emails = (await redis.smembers('users')) as string[];
  if (!emails || emails.length === 0) return [];
  const keys = emails.map((e) => userKey(e));
  const rows = (await redis.mget(...keys)) as Array<User | null>;
  return rows.filter((r): r is User => Boolean(r));
}

export async function createUser(opts: {
  email: string;
  password: string;
  role: UserRole;
}): Promise<User> {
  const email = opts.email.toLowerCase().trim();
  const existing = await getUser(email);
  if (existing) throw new Error(`User ${email} already exists`);
  const { hash, salt } = await hashPassword(opts.password);
  const user: User = {
    email,
    password_hash: hash,
    salt,
    role: opts.role,
    created_at: new Date().toISOString(),
  };
  await redis.set(userKey(email), user);
  await redis.sadd('users', email);
  return user;
}

export async function updateUserPassword(email: string, newPassword: string): Promise<void> {
  const user = await getUser(email);
  if (!user) throw new Error(`User ${email} not found`);
  const { hash, salt } = await hashPassword(newPassword);
  const updated: User = { ...user, password_hash: hash, salt };
  await redis.set(userKey(email), updated);
}

export async function updateUserRole(email: string, role: UserRole): Promise<void> {
  const user = await getUser(email);
  if (!user) throw new Error(`User ${email} not found`);
  const updated: User = { ...user, role };
  await redis.set(userKey(email), updated);
}

export async function deleteUser(email: string): Promise<void> {
  const e = email.toLowerCase().trim();
  await redis.del(userKey(e));
  await redis.srem('users', e);
}

export async function touchLastLogin(email: string): Promise<void> {
  const user = await getUser(email);
  if (!user) return;
  user.last_login = new Date().toISOString();
  await redis.set(userKey(email), user);
}

// =============================================================================
// Sessions
// =============================================================================

export const SESSION_COOKIE_NAME = 'mim_dashboard_session';

function sessionKey(id: string): string {
  return `session:${id}`;
}

export async function createSession(email: string): Promise<string> {
  const id = randomBytes(32).toString('hex');
  await redis.set(sessionKey(id), email.toLowerCase().trim(), { ex: SESSION_TTL_SECONDS });
  return id;
}

export async function getSessionEmail(id: string): Promise<string | null> {
  if (!id) return null;
  const email = await redis.get<string>(sessionKey(id));
  return email || null;
}

export async function deleteSession(id: string): Promise<void> {
  if (!id) return;
  await redis.del(sessionKey(id));
}

export function buildSessionCookie(sessionId: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

// =============================================================================
// Admin bootstrap
// =============================================================================

/**
 * If no users exist yet AND the supplied creds match ADMIN_EMAIL + ADMIN_PASSWORD
 * env vars, auto-create the admin record. Returns the created user (or null if
 * no bootstrap happened).
 *
 * This lets the very first login work even on a fresh deployment without
 * having to seed the database manually.
 */
export async function maybeBootstrapAdmin(
  email: string,
  password: string
): Promise<User | null> {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminEmail || !adminPassword) return null;
  if (email.toLowerCase().trim() !== adminEmail) return null;
  if (password !== adminPassword) return null;

  // Only bootstrap if Redis has zero users.
  const existingCount = (await redis.scard('users')) as number;
  if (existingCount > 0) return null;

  return createUser({ email: adminEmail, password: adminPassword, role: 'admin' });
}

// =============================================================================
// High-level auth check
// =============================================================================

export async function authenticateRequest(
  sessionId: string | undefined
): Promise<User | null> {
  if (!sessionId) return null;
  const email = await getSessionEmail(sessionId);
  if (!email) return null;
  return getUser(email);
}
