import { Router, type Request } from 'express';
import prisma from '../lib/prisma';
import { ApiError, asyncHandler, buildPageMeta, parsePagination } from './http';
import { uniqueSlug } from './helpers';

type PrismaDelegate = {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findUnique: (args: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

export interface CrudOptions {
  /** Prisma delegate name, e.g. 'testimonial'. */
  model: string;
  /** Fields searched by the ?search= query. */
  searchFields?: string[];
  /** Default ordering for the list endpoint. */
  defaultOrderBy?: Record<string, unknown> | Record<string, unknown>[];
  /** Relations to include on list + detail. */
  include?: Record<string, unknown>;
  /** Whitelist of writable fields — anything else in the body is dropped. */
  writableFields: string[];
  /** Number-typed fields, coerced before writing. */
  numberFields?: string[];
  /** Boolean-typed fields, coerced before writing. */
  booleanFields?: string[];
  /** Date-typed fields, coerced before writing. */
  dateFields?: string[];
  /** JSON fields, parsed from strings when needed. */
  jsonFields?: string[];
  /** Source field to derive a unique slug from (requires slugModel). */
  slugFrom?: string;
  slugModel?: 'product' | 'category' | 'page' | 'attributeGroup';
  /** Enables PATCH /:id/status and POST /reorder. */
  hasStatus?: boolean;
  hasSortOrder?: boolean;
  /** Extra where-clause built from query params. */
  buildWhere?: (req: Request) => Record<string, unknown>;
  /** Last-chance hook to shape the payload before create/update. */
  beforeWrite?: (
    data: Record<string, unknown>,
    req: Request,
    mode: 'create' | 'update',
    existingId?: string,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Side effects after a successful write (e.g. cascading sort order). */
  afterWrite?: (record: unknown, req: Request, mode: 'create' | 'update') => Promise<void> | void;
  /** Runs before delete — throw to block, or clean up files. */
  beforeDelete?: (record: unknown) => Promise<void> | void;
}

function delegateFor(model: string): PrismaDelegate {
  const delegate = (prisma as unknown as Record<string, PrismaDelegate>)[model];
  if (!delegate) throw new Error(`Unknown Prisma model: ${model}`);
  return delegate;
}

function coerce(value: unknown, kind: 'number' | 'boolean' | 'date' | 'json'): unknown {
  if (value === null || value === undefined || value === '') {
    return kind === 'boolean' ? false : null;
  }
  switch (kind) {
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
    case 'date': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'json':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    default:
      return value;
  }
}

/** Picks + coerces only whitelisted fields from a request body. */
export function pickWritable(body: Record<string, unknown>, opts: CrudOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of opts.writableFields) {
    if (!(field in body)) continue;
    let value = body[field];
    if (opts.numberFields?.includes(field)) value = coerce(value, 'number');
    else if (opts.booleanFields?.includes(field)) value = coerce(value, 'boolean');
    else if (opts.dateFields?.includes(field)) value = coerce(value, 'date');
    else if (opts.jsonFields?.includes(field)) value = coerce(value, 'json');
    else if (value === '') value = null;
    out[field] = value;
  }
  return out;
}

export function createCrudRouter(opts: CrudOptions): Router {
  const router = Router();
  const model = delegateFor(opts.model);
  const defaultOrderBy =
    opts.defaultOrderBy ??
    (opts.hasSortOrder ? [{ sortOrder: 'asc' }, { createdAt: 'desc' }] : { createdAt: 'desc' });

  // ---- LIST -----------------------------------------------------------------
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { page, perPage, skip, take } = parsePagination(req.query as Record<string, unknown>, 25, 200);
      const search = String(req.query.search ?? '').trim();
      const status = String(req.query.status ?? '').trim();

      const where: Record<string, unknown> = { ...(opts.buildWhere?.(req) ?? {}) };
      if (search && opts.searchFields?.length) {
        where.OR = opts.searchFields.map((field) => ({
          [field]: { contains: search, mode: 'insensitive' },
        }));
      }
      if (status && opts.hasStatus) where.status = status;

      const orderParam = String(req.query.orderBy ?? '').trim();
      const orderDir = String(req.query.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
      const orderBy = orderParam ? { [orderParam]: orderDir } : defaultOrderBy;

      const [items, total] = await Promise.all([
        model.findMany({ where, orderBy, skip, take, ...(opts.include ? { include: opts.include } : {}) }),
        model.count({ where }),
      ]);

      res.json({ success: true, data: items, meta: buildPageMeta(page, perPage, total) });
    }),
  );

  // ---- READ ONE -------------------------------------------------------------
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const item = await model.findUnique({
        where: { id: req.params.id },
        ...(opts.include ? { include: opts.include } : {}),
      });
      if (!item) throw ApiError.notFound();
      res.json({ success: true, data: item });
    }),
  );

  // ---- CREATE ---------------------------------------------------------------
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      let data = pickWritable(req.body ?? {}, opts);

      if (opts.slugFrom && opts.slugModel) {
        const source = (data.slug as string) || (data[opts.slugFrom] as string) || '';
        data.slug = await uniqueSlug(opts.slugModel, source);
      }
      if (opts.beforeWrite) data = await opts.beforeWrite(data, req, 'create');

      const created = await model.create({
        data,
        ...(opts.include ? { include: opts.include } : {}),
      });
      await opts.afterWrite?.(created, req, 'create');
      res.status(201).json({ success: true, data: created });
    }),
  );

  // ---- UPDATE ---------------------------------------------------------------
  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const existing = await model.findUnique({ where: { id: req.params.id } });
      if (!existing) throw ApiError.notFound();

      let data = pickWritable(req.body ?? {}, opts);

      if (opts.slugFrom && opts.slugModel && ('slug' in data || opts.slugFrom in data)) {
        const source =
          (data.slug as string) ||
          (data[opts.slugFrom] as string) ||
          ((existing as Record<string, unknown>)[opts.slugFrom] as string);
        data.slug = await uniqueSlug(opts.slugModel, source, req.params.id);
      }
      if (opts.beforeWrite) data = await opts.beforeWrite(data, req, 'update', req.params.id);

      const updated = await model.update({
        where: { id: req.params.id },
        data,
        ...(opts.include ? { include: opts.include } : {}),
      });
      await opts.afterWrite?.(updated, req, 'update');
      res.json({ success: true, data: updated });
    }),
  );

  // ---- STATUS (draft / publish / archive) -----------------------------------
  if (opts.hasStatus) {
    router.patch(
      '/:id/status',
      asyncHandler(async (req, res) => {
        const status = String(req.body?.status ?? '').toUpperCase();
        if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
          throw ApiError.badRequest('status must be DRAFT, PUBLISHED or ARCHIVED');
        }
        const extra: Record<string, unknown> = {};
        if (opts.model === 'product' && status === 'PUBLISHED') extra.publishedAt = new Date();

        const updated = await model.update({
          where: { id: req.params.id },
          data: { status, ...extra },
        });
        res.json({ success: true, data: updated });
      }),
    );
  }

  // ---- REORDER --------------------------------------------------------------
  if (opts.hasSortOrder) {
    router.post(
      '/reorder',
      asyncHandler(async (req, res) => {
        const items = req.body?.items as { id: string; sortOrder: number }[] | undefined;
        if (!Array.isArray(items) || items.length === 0) {
          throw ApiError.badRequest('items must be a non-empty array of { id, sortOrder }');
        }
        await prisma.$transaction(
          items.map((item) =>
            model.update({
              where: { id: item.id },
              data: { sortOrder: Number(item.sortOrder) || 0 },
            }),
          ) as never,
        );
        res.json({ success: true, data: { reordered: items.length } });
      }),
    );
  }

  // ---- DELETE ---------------------------------------------------------------
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const existing = await model.findUnique({ where: { id: req.params.id } });
      if (!existing) throw ApiError.notFound();
      await opts.beforeDelete?.(existing);
      await model.delete({ where: { id: req.params.id } });
      res.json({ success: true, data: { id: req.params.id } });
    }),
  );

  return router;
}
