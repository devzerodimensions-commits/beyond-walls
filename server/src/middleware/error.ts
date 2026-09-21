import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from '../utils/http';
import { env } from '../config/env';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the highlighted fields',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: `A record with this ${target} already exists` },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Record not found' },
      });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'FOREIGN_KEY',
          message: 'This record is referenced elsewhere and cannot be removed',
        },
      });
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'DB_UNAVAILABLE',
        message: 'Database is not reachable. Check DATABASE_URL and that PostgreSQL is running.',
      },
    });
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error';
  // Multer surfaces upload limits as plain errors.
  if (message.includes('File too large')) {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: `Upload exceeds the ${env.maxUploadMb}MB limit` },
    });
  }

  // eslint-disable-next-line no-console
  console.error('[error]', err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: env.isProduction ? 'Something went wrong' : message,
      ...(env.isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined }),
    },
  });
}
