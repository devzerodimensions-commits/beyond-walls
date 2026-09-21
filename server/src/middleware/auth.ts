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

/** Requires an authenticated ADMIN, re-checked against the database. */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized());
  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'ADMIN') return next(ApiError.forbidden('Admin access required'));

    // Re-verify against the DB so a demoted/disabled admin loses access immediately.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || !user.isActive || user.role !== 'ADMIN') {
      return next(ApiError.forbidden('Admin access required'));
    }

    req.user = payload;
    return next();
  } catch {
    return next(ApiError.unauthorized('Session expired, please sign in again'));
  }
}
