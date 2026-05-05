/**
 * Diagnostic-only endpoint. Returns the bootstrap state so you can verify
 * env vars are set and Redis is reachable. Reveals NO secrets.
 *
 *   GET /api/web/auth-status
 *
 * Response:
 *   {
 *     admin_email_set: boolean,
 *     admin_password_set: boolean,
 *     redis_reachable: boolean,
 *     user_count: number,
 *     bootstrap_will_fire: boolean   // true if a fresh-deploy login will work
 *   }
 */
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const adminEmailSet = Boolean(process.env.ADMIN_EMAIL?.trim());
  const adminPasswordSet = Boolean(process.env.ADMIN_PASSWORD);
  let redisReachable = false;
  let userCount: number | null = null;
  try {
    userCount = ((await redis.scard('users')) as number) || 0;
    redisReachable = true;
  } catch (e: any) {
    return NextResponse.json({
      admin_email_set: adminEmailSet,
      admin_password_set: adminPasswordSet,
      redis_reachable: false,
      redis_error: e?.message || 'unknown',
      user_count: null,
      bootstrap_will_fire: false,
    });
  }
  return NextResponse.json({
    admin_email_set: adminEmailSet,
    admin_password_set: adminPasswordSet,
    redis_reachable: redisReachable,
    user_count: userCount,
    bootstrap_will_fire: adminEmailSet && adminPasswordSet && (userCount === 0),
  });
}
