import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../utils/http';
import {
  hashPassword,
  refreshTokenExpiry,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '../../utils/auth';
import { clearRefreshCookie, readRefreshToken, setRefreshCookie } from '../../utils/cookies';
import { requireAuth } from '../../middleware/auth';
import { sendPasswordReset } from '../../services/email.service';
import { env } from '../../config/env';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, 'Please enter your name').max(80),
  email: z.string().email('Enter a valid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  phone: z.string().min(6).max(20).optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Enter your password'),
});

const PUBLIC_USER = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  createdAt: true,
} as const;

/**
 * Issues a token pair.
 *
 * The refresh token goes into an HttpOnly cookie so no script can read it; only
 * the short-lived access token is returned in the body for the SPA to hold in
 * memory.
 */
async function issueSession(
  res: import('express').Response,
  user: { id: string; email: string; role: 'ADMIN' | 'CUSTOMER' },
) {
  const payload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: refreshTokenExpiry() },
  });

  setRefreshCookie(res, refreshToken);
  return { accessToken };
}

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        passwordHash: await hashPassword(body.password),
        role: 'CUSTOMER',
      },
      select: PUBLIC_USER,
    });

    const session = await issueSession(res, { id: user.id, email: user.email, role: user.role });
    res.status(201).json({ success: true, data: { user, ...session } });
  }),
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Identical message for unknown email and wrong password, to avoid
    // confirming which addresses have accounts.
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw ApiError.unauthorized('Incorrect email or password');
    }
    if (!user.isActive) throw ApiError.forbidden('This account has been disabled');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await issueSession(res, user);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt,
        },
        ...session,
      },
    });
  }),
);

// POST /api/auth/refresh — reads the HttpOnly cookie
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = readRefreshToken(req);
    if (!token) throw ApiError.unauthorized('Session expired, please sign in again');

    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      clearRefreshCookie(res);
      throw ApiError.unauthorized('Session expired, please sign in again');
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      clearRefreshCookie(res);
      throw ApiError.unauthorized('Session expired, please sign in again');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      clearRefreshCookie(res);
      throw ApiError.unauthorized('Session expired, please sign in again');
    }

    // Rotate: the presented token is retired as a new one is issued.
    await prisma.refreshToken.update({ where: { token }, data: { revokedAt: new Date() } });
    const session = await issueSession(res, user);

    res.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
        ...session,
      },
    });
  }),
);

// POST /api/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = readRefreshToken(req);
    if (token) {
      await prisma.refreshToken
        .update({ where: { token }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
    }
    clearRefreshCookie(res);
    res.json({ success: true, data: { loggedOut: true } });
  }),
);

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: PUBLIC_USER,
    });
    if (!user) throw ApiError.notFound('Account not found');
    res.json({ success: true, data: user });
  }),
);

// PATCH /api/auth/me
router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      phone: z.string().min(6).max(20).nullable().optional(),
    });
    const body = schema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: body,
      select: PUBLIC_USER,
    });
    res.json({ success: true, data: user });
  }),
);

// POST /api/auth/change-password
router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, 'New password must be at least 8 characters').max(100),
    });
    const body = schema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) throw ApiError.notFound('Account not found');
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Your current password is incorrect');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearRefreshCookie(res);

    res.json({ success: true, data: { changed: true } });
  }),
);

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

const limitMessage = (message: string) => ({
  success: false,
  error: { code: 'RATE_LIMITED', message },
});

/**
 * Requesting a link is the enumeration and mail-bombing vector, so it is held
 * tight: five addresses per quarter hour.
 */
const requestResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many reset requests. Please try again in a few minutes.'),
});

/**
 * Using a link is a different risk: the attacker would need to guess a
 * 256-bit token. The limit here only has to stop brute force, and it must not
 * lock out someone whose first few passwords were rejected as too short.
 */
const useResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many attempts. Please request a new reset link.'),
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/auth/forgot-password
 *
 * Always answers the same way, whether or not the address has an account, so it
 * cannot be used to discover which emails are registered.
 */
router.post(
  '/forgot-password',
  requestResetLimiter,
  asyncHandler(async (req, res) => {
    const schema = z.object({ email: z.string().email('Enter a valid email address').toLowerCase() });
    const body = schema.parse(req.body);

    const genericResponse = {
      success: true,
      data: {
        message:
          'If an account exists for that address, we have sent a link to reset the password.',
      },
    };

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.isActive) return res.json(genericResponse);

    // Only one live token per account.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token), // only the hash is stored
        expiresAt: new Date(Date.now() + env.passwordResetTtlMinutes * 60_000),
      },
    });

    const resetUrl = `${env.publicSiteUrl.replace(/\/+$/, '')}/reset-password?token=${token}`;
    await sendPasswordReset(
      { name: user.name, email: user.email },
      resetUrl,
      env.passwordResetTtlMinutes,
    );

    return res.json(genericResponse);
  }),
);

/** GET /api/auth/reset-password/:token — lets the form check the link first. */
router.get(
  '/reset-password/:token',
  asyncHandler(async (req, res) => {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(req.params.token) },
      include: { user: { select: { email: true, isActive: true } } },
    });

    const valid =
      Boolean(record) && !record!.usedAt && record!.expiresAt > new Date() && record!.user.isActive;

    res.json({
      success: true,
      data: {
        valid,
        // Only a masked hint, so a leaked link does not also leak the address.
        email: valid ? record!.user.email.replace(/^(.).*(@.*)$/, '$1•••$2') : null,
      },
    });
  }),
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  useResetLimiter,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      token: z.string().min(16),
      password: z.string().min(8, 'Password must be at least 8 characters').max(100),
    });
    const body = schema.parse(req.body);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(body.token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw ApiError.badRequest('This reset link is no longer valid. Please request a new one.');
    }
    if (!record.user.isActive) throw ApiError.forbidden('This account has been disabled');

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(body.password) },
      }),
      // Single use.
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Resetting a password signs out every existing session.
      prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    clearRefreshCookie(res);
    res.json({
      success: true,
      data: { message: 'Your password has been changed. Please sign in with your new password.' },
    });
  }),
);

export default router;
