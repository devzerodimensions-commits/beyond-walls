import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/http';
import { verifyAccessToken, type TokenPayload } from '../utils/auth';
import prisma from '../lib/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
      /** Anonymous cart token sent by the storefront via the x-cart-session header. */
      cartSession?: string;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.accessToken;
  return cookieToken ?? null;
}

interface AdminAccessCheck {
  valid?: boolean;
  expiresAt: number;
  inFlight?: Promise<boolean>;
}

const ADMIN_ACCESS_TTL_MS = 15_000;
const adminAccessChecks = new Map<string, AdminAccessCheck>();

/**
 * Admin pages issue several API requests together. Collapse their identical
 * account checks and retain the answer briefly instead of adding one Neon
 * round trip to every request. The access JWT itself lasts longer than this;
 * the short cache only preserves the extra disabled/demoted-account check.
 */
async function hasActiveAdminAccess(userId: string): Promise<boolean> {
  const now = Date.now();
  const existing = adminAccessChecks.get(userId);
  if (existing?.valid !== undefined && existing.expiresAt > now) return existing.valid;
  if (existing?.inFlight) return existing.inFlight;

  const inFlight = prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  }).then((user) => {
    const valid = Boolean(user?.isActive && user.role === 'ADMIN');
    adminAccessChecks.set(userId, { valid, expiresAt: Date.now() + ADMIN_ACCESS_TTL_MS });
    return valid;
  }).catch((error) => {
    adminAccessChecks.delete(userId);
    throw error;
  });

  adminAccessChecks.set(userId, { expiresAt: 0, inFlight });
  return inFlight;
}

/** Attaches req.user when a valid token is present; never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // An expired/invalid token simply means "anonymous" for optional routes.
    }
  }
  req.cartSession = (req.headers['x-cart-session'] as string | undefined) || undefined;
  next();
}

/** Requires a valid access token. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized());
  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(ApiError.unauthorized('Session expired, please sign in again'));
  }
}

/** Requires an authenticated ADMIN, periodically re-checked against the database. */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized());
  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'ADMIN') return next(ApiError.forbidden('Admin access required'));

    // Re-verify against the DB so a demoted/disabled admin loses access within
    // the short cache window rather than for the lifetime of the access token.
    if (!(await hasActiveAdminAccess(payload.sub))) {
      return next(ApiError.forbidden('Admin access required'));
    }

    req.user = payload;
    return next();
  } catch {
    return next(ApiError.unauthorized('Session expired, please sign in again'));
  }
}
