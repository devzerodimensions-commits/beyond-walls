import type { Response, Request } from 'express';
import { env } from '../config/env';

/**
 * The refresh token lives in an HttpOnly cookie, not in localStorage, so a
 * cross-site script cannot read it. The short-lived access token is still
 * returned in the response body for the SPA to hold in memory.
 */
export const REFRESH_COOKIE = 'bw_rt';

function maxAgeMs(): number {
  const match = /^(\d+)([smhd])$/.exec(env.jwtRefreshExpiresIn);
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return match ? Number(match[1]) * multipliers[match[2]] : 30 * 86_400_000;
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    // Secure in production; over plain http in development the browser would
    // otherwise drop the cookie entirely.
    secure: env.isProduction,
    // 'lax' keeps the cookie on top-level navigations (the Razorpay return trip)
    // while still blocking it on cross-site POSTs.
    sameSite: env.isProduction ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: maxAgeMs(),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'strict' : 'lax',
    path: '/api/auth',
  });
}

/**
 * Reads the refresh token. The cookie is authoritative; the body is accepted
 * only as a migration path for sessions issued before this change, and for
 * non-browser clients.
 */
export function readRefreshToken(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const fromCookie = cookies?.[REFRESH_COOKIE];
  if (fromCookie) return fromCookie;

  const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof fromBody === 'string' && fromBody ? fromBody : null;
}
