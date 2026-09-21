import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, message, 'FORBIDDEN');
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message, 'NOT_FOUND');
  }
  static conflict(message: string) {
    return new ApiError(409, message, 'CONFLICT');
  }
  static unprocessable(message: string, details?: unknown) {
    return new ApiError(422, message, 'UNPROCESSABLE', details);
  }
  static server(message = 'Something went wrong') {
    return new ApiError(500, message, 'SERVER_ERROR');
  }
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function buildPageMeta(page: number, perPage: number, total: number): PageMeta {
  const totalPages = perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1;
  return {
    page,
    perPage,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function parsePagination(query: Record<string, unknown>, defaultPerPage = 12, maxPerPage = 100) {
  const page = Math.max(1, Number(query.page) || 1);
  const perPageRaw = Number(query.perPage ?? query.limit) || defaultPerPage;
  const perPage = Math.min(maxPerPage, Math.max(1, perPageRaw));
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}
