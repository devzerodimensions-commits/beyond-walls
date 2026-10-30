import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError, asyncHandler, buildPageMeta, parsePagination } from '../../utils/http';
import { toBool, uniqueSlug } from '../../utils/helpers';
import { persistUploads, upload } from '../../middleware/upload';
import { deleteFileIfUnreferenced } from '../../services/media.service';
import { isSellable } from '../../services/pricing.service';

const router = Router();

const ADMIN_PRODUCT_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: { orderBy: { sortOrder: 'asc' as const } },
  personalization: { orderBy: { sortOrder: 'asc' as const } },
  category: { select: { id: true, name: true, slug: true } },
  subcategory: { select: { id: true, name: true, slug: true } },
  attributes: {
    select: {
      value: {
        select: { id: true, name: true, slug: true, group: { select: { id: true, name: true, slug: true } } },
      },
    },
  },
  _count: { select: { orderItems: true, reviews: true } },
};

const nullableString = z.string().max(20000).nullable().optional();

/**
 * Optional numeric input.
 *
 * An ABSENT field stays `undefined` so `compact()` drops it and the column keeps
 * its existing value (or its schema default on create). Only an explicit `null`
 * or empty string clears the column — and `NON_NULLABLE_NUMBERS` below protects
 * the columns that cannot hold null.
 */
const nullableNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });

/** Columns that are `Int`/`Decimal` NOT NULL with a default — never write null. */
const NON_NULLABLE_NUMBERS = new Set([
  'taxRatePercent', 'stock', 'lowStockAlert', 'minOrderQty', 'sortOrder', 'priceDelta',
]);

const productSchema = z.object({
  name: z.string().min(2, 'Product name is required').max(160),
  slug: z.string().max(180).optional(),
  sku: z.string().max(64).nullable().optional(),
  shortDescription: nullableString,
  description: nullableString,
  designNote: nullableString,
  materialNote: nullableString,
  careInstructions: nullableString,
  installationNote: nullableString,
  shippingNote: nullableString,
  features: z.array(z.string().max(300)).optional(),
  applications: z.array(z.string().max(300)).optional(),
  includedItems: z.array(z.string().max(300)).optional(),

  categoryId: z.string().nullable().optional(),
  subcategoryId: z.string().nullable().optional(),

  price: nullableNumber,
  compareAtPrice: nullableNumber,
  costPrice: nullableNumber,
  taxRatePercent: nullableNumber,
  priceConfirmed: z.boolean().optional(),
  codAvailable: z.boolean().optional(),

  trackInventory: z.boolean().optional(),
  stock: nullableNumber,
  lowStockAlert: nullableNumber,
  minOrderQty: nullableNumber,
  maxOrderQty: nullableNumber,

  widthInches: nullableNumber,
  heightInches: nullableNumber,
  depthMm: nullableNumber,
  weightGrams: nullableNumber,

  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  featured: z.boolean().optional(),
  isNew: z.boolean().optional(),
  badge: z.string().max(40).nullable().optional(),
  sortOrder: nullableNumber,

  livePreviewEnabled: z.boolean().optional(),
  livePreviewTemplate: z.string().max(60).nullable().optional(),
  /*
   * Per-product overrides of the preview: plate proportions, default colours,
   * placeholder copy, the selectable palette and the caption. The template
   * supplies the starting point; whatever is stored here wins. Kept as a free
   * JSON object so a new preview option never needs a migration — the renderer
   * ignores keys it does not know.
   */
  livePreviewConfig: z.record(z.unknown()).optional(),

  productionDays: nullableNumber,
  /*
   * A YouTube or Vimeo link, or a direct URL to an mp4/webm. Validated in the
   * admin rather than here beyond a length and a scheme, because a studio
   * pasting a link should be told what is wrong with it while they are looking
   * at the field, not after a save.
   */
  videoUrl: z
    .string()
    .max(500)
    .refine((v) => !v || /^https?:\/\//i.test(v) || v.startsWith('/uploads/'), {
      message: 'Enter a full https:// link to the video',
    })
    .nullable()
    .optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(400).nullable().optional(),
  seoKeywords: z.string().max(400).nullable().optional(),
  ogImage: z.string().max(400).nullable().optional(),

  /** AttributeValue ids — replaces the full set when present. */
  attributeValueIds: z.array(z.string()).optional(),
});

/**
 * Strips `undefined` so a PATCH never nulls out untouched columns, and drops a
 * `null` aimed at a NOT NULL column so it falls back to its default instead of
 * throwing.
 */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value === null && NON_NULLABLE_NUMBERS.has(key)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query as Record<string, unknown>, 25, 200);
    const q = req.query as Record<string, unknown>;

    const where: Prisma.ProductWhereInput = {};
    const search = String(q.search ?? '').trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    /*
     * Archived products are hidden unless asked for.
     *
     * A product an order references cannot be deleted, only archived — so a
     * shop that has run a few test orders accumulates rows it will never touch
     * again. Listing them beside live products buries the real catalogue.
     */
    if (q.status) where.status = String(q.status) as never;
    else if (String(q.includeArchived ?? '') !== 'true') {
      where.status = { not: 'ARCHIVED' };
    }
    if (q.categoryId) where.categoryId = String(q.categoryId);
    if (String(q.featured ?? '') === 'true') where.featured = true;
    if (String(q.lowStock ?? '') === 'true') {
      where.AND = [{ trackInventory: true }, { stock: { lte: 5 } }];
    }

    /*
     * Only columns the list actually shows can be sorted by.
     *
     * The field went straight into Prisma's orderBy, so any string in the
     * query became a database error -- a 500 from a URL anyone could type,
     * and nothing in the UI had to be wrong for it to happen.
     */
    const SORTABLE = new Set(['name', 'sku', 'price', 'stock', 'status', 'createdAt', 'updatedAt']);
    const requested = String(q.orderBy ?? '');
    const orderField = SORTABLE.has(requested) ? requested : 'createdAt';
    const orderDir = String(q.order ?? 'desc') === 'asc' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { [orderField]: orderDir } as never,
        skip,
        take,
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          category: { select: { id: true, name: true, slug: true } },
          _count: { select: { variants: true, personalization: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    /*
     * Totals for the status tabs.
     *
     * Counted over the same search and category the list is using, but with
     * the status condition dropped — the tabs exist to switch status, so each
     * one has to report what it would show rather than what is showing now.
     * Archived is included here even though the list hides it by default,
     * which is the only way anyone discovers the archive exists.
     */
    const countWhere: Prisma.ProductWhereInput = { ...where };
    delete countWhere.status;

    const grouped = await prisma.product.groupBy({
      by: ['status'],
      where: countWhere,
      _count: { _all: true },
    });

    const counts = grouped.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.status] = row._count._all;
        acc.ALL += row._count._all;
        return acc;
      },
      { ALL: 0, PUBLISHED: 0, DRAFT: 0, ARCHIVED: 0 },
    );

    res.json({
      success: true,
      data: items,
      meta: { ...buildPageMeta(page, perPage, total), counts },
    });
  }),
);

// ---------------------------------------------------------------------------
// CSV in and out
//
// Both sit above the /:id routes on purpose: Express matches in order, and
// "export.csv" would otherwise be read as a product id.
// ---------------------------------------------------------------------------

/** The columns, in order. Export writes them; import reads the ones it can act on. */
const CSV_COLUMNS = [
  'SKU', 'Name', 'Price', 'Compare At', 'Cost', 'Stock', 'Status', 'Featured', 'Category',
] as const;

/** GET /admin/products/export.csv */
router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const where: Prisma.ProductWhereInput = {};
    if (req.query.status) where.status = String(req.query.status) as never;
    else where.status = { not: 'ARCHIVED' };
    if (req.query.categoryId) where.categoryId = String(req.query.categoryId);

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { category: { select: { name: true } } },
      take: 5000,
    });

    /*
     * Every field is quoted, and a quote inside one is doubled. A product name
     * with a comma in it is ordinary, and unquoted it would silently shift
     * every later column on that row.
     */
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const rows = products.map((p) =>
      [
        p.sku ?? '',
        p.name,
        p.price ?? '',
        p.compareAtPrice ?? '',
        p.costPrice ?? '',
        p.trackInventory ? p.stock : '',
        p.status,
        p.featured ? 'yes' : 'no',
        p.category?.name ?? '',
      ]
        .map(escape)
        .join(','),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="beyond-walls-products.csv"');
    // A BOM, so Excel opens rupee amounts and accented names as UTF-8 rather
    // than as the local code page.
    res.send(`﻿${[CSV_COLUMNS.join(','), ...rows].join('\n')}`);
  }),
);

/**
 * POST /admin/products/import
 *
 * Rows are matched on SKU: a known SKU is updated, an unknown one with a name
 * is created as a draft. Nothing is ever deleted, and nothing is created
 * already live — a catalogue arriving from a spreadsheet gets looked at before
 * customers see it.
 *
 * Each row stands alone. One bad price does not abandon the other four
 * hundred, and the response says what happened to every row so the person who
 * uploaded it can fix that line and send it again.
 */
router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const rowSchema = z.object({
      sku: z.string().trim().min(1).max(64),
      name: z.string().trim().max(160).optional(),
      price: z.coerce.number().nonnegative().optional(),
      compareAtPrice: z.coerce.number().nonnegative().optional(),
      costPrice: z.coerce.number().nonnegative().optional(),
      stock: z.coerce.number().int().min(0).optional(),
      status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
      featured: z.boolean().optional(),
    });

    const rows = z.array(z.unknown()).max(2000).parse(req.body?.rows ?? []);

    const results: { row: number; sku: string; outcome: string; message?: string }[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const lineNumber = index + 2; // 1 is the header, and that is how a spreadsheet counts
      const parsed = rowSchema.safeParse(rows[index]);

      if (!parsed.success) {
        const raw = rows[index] as { sku?: unknown } | null;
        results.push({
          row: lineNumber,
          sku: String(raw?.sku ?? ''),
          outcome: 'skipped',
          message: parsed.error.issues[0]?.message ?? 'Could not be read',
        });
        continue;
      }

      const { sku, ...fields } = parsed.data;

      try {
        const existing = await prisma.product.findFirst({ where: { sku } });

        if (!existing) {
          if (!fields.name) {
            results.push({ row: lineNumber, sku, outcome: 'skipped', message: 'New product needs a name' });
            continue;
          }
          const created = await prisma.product.create({
            data: {
              ...fields,
              name: fields.name,
              sku,
              slug: await uniqueSlug('product', fields.name),
              // Always a draft, whatever the file said.
              status: 'DRAFT',
            } as never,
          });
          results.push({ row: lineNumber, sku, outcome: 'created', message: created.name });
          continue;
        }

        const updated = await prisma.product.update({
          where: { id: existing.id },
          data: {
            ...fields,
            ...(fields.status === 'PUBLISHED' && existing.status !== 'PUBLISHED'
              ? { publishedAt: new Date() }
              : {}),
          } as never,
        });

        // Publishing from a spreadsheet answers to the same rule as the toggle.
        if (updated.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
          try {
            await assertPublishable(updated.id);
          } catch (err) {
            await prisma.product.update({
              where: { id: updated.id },
              data: { status: existing.status },
            });
            results.push({
              row: lineNumber,
              sku,
              outcome: 'updated',
              message: `Saved, but left as ${existing.status.toLowerCase()}: ${
                err instanceof Error ? err.message : 'cannot be published yet'
              }`,
            });
            continue;
          }
        }

        results.push({ row: lineNumber, sku, outcome: 'updated', message: updated.name });
      } catch (err) {
        results.push({
          row: lineNumber,
          sku,
          outcome: 'skipped',
          message: err instanceof Error ? err.message : 'Could not be saved',
        });
      }
    }

    const summary = {
      created: results.filter((r) => r.outcome === 'created').length,
      updated: results.filter((r) => r.outcome === 'updated').length,
      skipped: results.filter((r) => r.outcome === 'skipped').length,
    };

    res.json({ success: true, data: { summary, results } });
  }),
);

// ---------------------------------------------------------------------------
// READ ONE
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: ADMIN_PRODUCT_INCLUDE,
    });
    if (!product) throw ApiError.notFound('Product not found');
    res.json({ success: true, data: product });
  }),
);

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = productSchema.parse(req.body);
    const { attributeValueIds, ...fields } = body;

    const slug = await uniqueSlug('product', body.slug || body.name);
    const status = body.status ?? 'DRAFT';

    const product = await prisma.product.create({
      data: {
        ...compact(fields),
        slug,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        ...(attributeValueIds?.length
          ? { attributes: { create: attributeValueIds.map((valueId) => ({ valueId })) } }
          : {}),
      } as never,
      include: ADMIN_PRODUCT_INCLUDE,
    });

    res.status(201).json({ success: true, data: product });
  }),
);

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound('Product not found');

    const body = productSchema.partial().parse(req.body);
    const { attributeValueIds, ...fields } = body;

    const data: Record<string, unknown> = compact(fields);

    if (body.slug !== undefined || body.name !== undefined) {
      data.slug = await uniqueSlug('product', body.slug || body.name || existing.name, existing.id);
    }
    if (body.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      data.publishedAt = new Date();
    }

    if (attributeValueIds) {
      await prisma.productAttribute.deleteMany({ where: { productId: existing.id } });
      if (attributeValueIds.length) {
        await prisma.productAttribute.createMany({
          data: attributeValueIds.map((valueId) => ({ productId: existing.id, valueId })),
          skipDuplicates: true,
        });
      }
    }

    const product = await prisma.product.update({
      where: { id: existing.id },
      data: data as never,
      include: ADMIN_PRODUCT_INCLUDE,
    });

    // Publishing through the main form is held to the same rule as the toggle.
    if (product.status === 'PUBLISHED') {
      await assertPublishable(product.id).catch(async (err) => {
        await prisma.product.update({ where: { id: product.id }, data: { status: existing.status } });
        throw err;
      });
    }

    res.json({ success: true, data: product });
  }),
);

/**
 * Publishing guard: a live catalogue product must be buyable.
 *
 * Every product is direct-purchase, so it needs a resolvable price — either its
 * own, or one on every published variant. Anything else would put an unbuyable
 * product in front of a customer.
 */
async function assertPublishable(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { select: { price: true, status: true } } },
  });
  if (!product) throw ApiError.notFound('Product not found');

  if (!isSellable(product, product.variants)) {
    const hasVariants = product.variants.some((v) => v.status === 'PUBLISHED');
    throw ApiError.badRequest(
      hasVariants
        ? 'Set a price on this product, or on each published variant, before publishing it.'
        : 'Set a price on this product before publishing it.',
    );
  }
}

// PATCH /:id/status — draft / publish / archive
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const status = String(req.body?.status ?? '').toUpperCase();
    if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
      throw ApiError.badRequest('status must be DRAFT, PUBLISHED or ARCHIVED');
    }
    if (status === 'PUBLISHED') await assertPublishable(req.params.id);

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        status: status as never,
        ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
      },
    });
    res.json({ success: true, data: product });
  }),
);

// POST /reorder
router.post(
  '/reorder',
  asyncHandler(async (req, res) => {
    const items = req.body?.items as { id: string; sortOrder: number }[] | undefined;
    if (!Array.isArray(items) || !items.length) throw ApiError.badRequest('items array is required');
    await prisma.$transaction(
      items.map((i) => prisma.product.update({ where: { id: i.id }, data: { sortOrder: Number(i.sortOrder) || 0 } })),
    );
    res.json({ success: true, data: { reordered: items.length } });
  }),
);

// POST /:id/duplicate — clone a product with all its config
router.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const source = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { images: true, variants: true, personalization: true, attributes: true },
    });
    if (!source) throw ApiError.notFound('Product not found');

    const {
      id, slug, createdAt, updatedAt, publishedAt,
      images, variants, personalization, attributes, sku,
      ...rest
    } = source;

    const copy = await prisma.product.create({
      data: {
        ...rest,
        name: `${source.name} (copy)`,
        slug: await uniqueSlug('product', `${source.name}-copy`),
        sku: null,
        status: 'DRAFT',
        publishedAt: null,
        images: { create: images.map((i) => ({ url: i.url, alt: i.alt, sortOrder: i.sortOrder, isPrimary: i.isPrimary })) },
        variants: {
          create: variants.map((v) => ({
            label: v.label, price: v.price, compareAtPrice: v.compareAtPrice,
            stock: v.stock, image: v.image, options: v.options as never,
            sortOrder: v.sortOrder, isDefault: v.isDefault, status: v.status,
          })),
        },
        personalization: {
          create: personalization.map((p) => ({
            key: p.key, label: p.label, type: p.type, placeholder: p.placeholder,
            helpText: p.helpText, required: p.required, maxLength: p.maxLength,
            minLength: p.minLength, pattern: p.pattern, options: p.options as never,
            defaultValue: p.defaultValue, priceDelta: p.priceDelta, sortOrder: p.sortOrder,
            status: p.status, previewSlot: p.previewSlot,
          })),
        },
        attributes: { create: attributes.map((a) => ({ valueId: a.valueId })) },
      } as never,
      include: ADMIN_PRODUCT_INCLUDE,
    });

    res.status(201).json({ success: true, data: copy });
  }),
);

// DELETE
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { images: true, _count: { select: { orderItems: true } } },
    });
    if (!product) throw ApiError.notFound('Product not found');

    // Products that appear on orders are archived rather than destroyed,
    // so historical orders keep their data.
    if (product._count.orderItems > 0) {
      const archived = await prisma.product.update({
        where: { id: product.id },
        data: { status: 'ARCHIVED' },
      });
      return res.json({
        success: true,
        data: archived,
        message: 'This product appears on existing orders, so it has been archived instead of deleted.',
      });
    }

    for (const image of product.images) {
      await deleteFileIfUnreferenced(image.url, { model: 'productImage', id: image.id });
    }
    await prisma.product.delete({ where: { id: product.id } });
    return res.json({ success: true, data: { id: product.id } });
  }),
);

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

router.post(
  '/:id/images',
  upload.array('images', 12),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { images: true },
    });
    if (!product) throw ApiError.notFound('Product not found');

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw ApiError.badRequest('No images were uploaded');

    // Validated and stored before anything reaches the database.
    const stored = await persistUploads(files, 'image', 'products');

    let sortOrder = product.images.length;
    const created = [];
    for (const item of stored) {
      await prisma.mediaAsset.upsert({
        where: { url: item.url },
        create: {
          url: item.url,
          filename: item.originalName,
          mimeType: item.mimeType,
          size: item.size,
          folder: 'products',
          width: item.width,
          height: item.height,
        },
        update: { width: item.width, height: item.height },
      });
      created.push(
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url: item.url,
            alt: product.name,
            sortOrder: sortOrder++,
            isPrimary: product.images.length === 0 && created.length === 0,
            width: item.width,
            height: item.height,
          },
        }),
      );
    }

    res.status(201).json({ success: true, data: created });
  }),
);

/** Attach an image already in the media library. */
router.post(
  '/:id/images/link',
  asyncHandler(async (req, res) => {
    const url = String(req.body?.url ?? '');
    if (!url) throw ApiError.badRequest('url is required');

    /*
     * The media library already measured this file when it was uploaded, so
     * the shape comes from there rather than from opening the image again --
     * and an asset old enough to predate the measurement leaves both null,
     * which the shop handles.
     */
    const [count, asset] = await Promise.all([
      prisma.productImage.count({ where: { productId: req.params.id } }),
      prisma.mediaAsset.findUnique({ where: { url }, select: { width: true, height: true } }),
    ]);
    const image = await prisma.productImage.create({
      data: {
        productId: req.params.id,
        url,
        alt: String(req.body?.alt ?? ''),
        sortOrder: count,
        isPrimary: count === 0,
        width: asset?.width ?? null,
        height: asset?.height ?? null,
      },
    });
    res.status(201).json({ success: true, data: image });
  }),
);

router.patch(
  '/:id/images/:imageId',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        alt: z.string().max(200).nullable().optional(),
        sortOrder: z.number().int().optional(),
        isPrimary: z.boolean().optional(),
      })
      .parse(req.body);

    if (body.isPrimary) {
      await prisma.productImage.updateMany({
        where: { productId: req.params.id },
        data: { isPrimary: false },
      });
    }
    const image = await prisma.productImage.update({ where: { id: req.params.imageId }, data: body });
    res.json({ success: true, data: image });
  }),
);

router.post(
  '/:id/images/reorder',
  asyncHandler(async (req, res) => {
    const items = req.body?.items as { id: string; sortOrder: number }[] | undefined;
    if (!Array.isArray(items)) throw ApiError.badRequest('items array is required');
    await prisma.$transaction(
      items.map((i) =>
        prisma.productImage.update({ where: { id: i.id }, data: { sortOrder: Number(i.sortOrder) || 0 } }),
      ),
    );
    res.json({ success: true, data: { reordered: items.length } });
  }),
);

router.delete(
  '/:id/images/:imageId',
  asyncHandler(async (req, res) => {
    const image = await prisma.productImage.findUnique({ where: { id: req.params.imageId } });
    if (!image) throw ApiError.notFound('Image not found');

    await prisma.productImage.delete({ where: { id: image.id } });
    await deleteFileIfUnreferenced(image.url);

    // Promote another image to primary if we just removed it.
    if (image.isPrimary) {
      const next = await prisma.productImage.findFirst({
        where: { productId: req.params.id },
        orderBy: { sortOrder: 'asc' },
      });
      if (next) await prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }

    res.json({ success: true, data: { id: image.id } });
  }),
);

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const variantSchema = z.object({
  label: z.string().min(1, 'Variant label is required').max(160),
  sku: z.string().max(64).nullable().optional(),
  price: nullableNumber,
  compareAtPrice: nullableNumber,
  stock: nullableNumber,
  image: z.string().max(400).nullable().optional(),
  options: z.record(z.string()).optional(),
  sortOrder: nullableNumber,
  isDefault: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

router.post(
  '/:id/variants',
  asyncHandler(async (req, res) => {
    const body = variantSchema.parse(req.body);
    if (body.isDefault) {
      await prisma.productVariant.updateMany({ where: { productId: req.params.id }, data: { isDefault: false } });
    }
    const variant = await prisma.productVariant.create({
      data: { ...compact(body), productId: req.params.id, options: (body.options ?? {}) as never } as never,
    });
    res.status(201).json({ success: true, data: variant });
  }),
);

router.patch(
  '/:id/variants/:variantId',
  asyncHandler(async (req, res) => {
    const body = variantSchema.partial().parse(req.body);
    if (body.isDefault) {
      await prisma.productVariant.updateMany({ where: { productId: req.params.id }, data: { isDefault: false } });
    }
    const variant = await prisma.productVariant.update({
      where: { id: req.params.variantId },
      data: compact(body) as never,
    });
    res.json({ success: true, data: variant });
  }),
);

router.post(
  '/:id/variants/reorder',
  asyncHandler(async (req, res) => {
    const items = req.body?.items as { id: string; sortOrder: number }[] | undefined;
    if (!Array.isArray(items)) throw ApiError.badRequest('items array is required');
    await prisma.$transaction(
      items.map((i) =>
        prisma.productVariant.update({ where: { id: i.id }, data: { sortOrder: Number(i.sortOrder) || 0 } }),
      ),
    );
    res.json({ success: true, data: { reordered: items.length } });
  }),
);

router.delete(
  '/:id/variants/:variantId',
  asyncHandler(async (req, res) => {
    await prisma.productVariant.delete({ where: { id: req.params.variantId } });
    res.json({ success: true, data: { id: req.params.variantId } });
  }),
);

// ---------------------------------------------------------------------------
// Personalization fields
// ---------------------------------------------------------------------------

const personalizationSchema = z.object({
  key: z
    .string()
    .min(1, 'Field key is required')
    .max(50)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Key must start with a letter and contain only letters, numbers or _'),
  label: z.string().min(1, 'Label is required').max(120),
  type: z.enum([
    'TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'RADIO', 'CHECKBOX', 'COLOR', 'FONT',
    'IMAGE_UPLOAD', 'FILE_UPLOAD', 'URL', 'GSTIN', 'PHONE', 'EMAIL', 'DATE',
  ]),
  placeholder: z.string().max(160).nullable().optional(),
  helpText: z.string().max(400).nullable().optional(),
  required: z.boolean().optional(),
  maxLength: nullableNumber,
  minLength: nullableNumber,
  pattern: z.string().max(300).nullable().optional(),
  options: z
    .array(
      z.object({
        label: z.string().max(120),
        value: z.string().max(120),
        hex: z.string().max(20).optional(),
        priceDelta: z.union([z.number(), z.string()]).optional(),
      }),
    )
    .optional(),
  defaultValue: z.string().max(300).nullable().optional(),
  priceDelta: nullableNumber,
  sortOrder: nullableNumber,
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  previewSlot: z.string().max(40).nullable().optional(),
});

router.post(
  '/:id/personalization',
  asyncHandler(async (req, res) => {
    const body = personalizationSchema.parse(req.body);
    const field = await prisma.personalizationField.create({
      data: {
        ...compact(body),
        productId: req.params.id,
        options: (body.options ?? []) as never,
      } as never,
    });
    res.status(201).json({ success: true, data: field });
  }),
);

router.patch(
  '/:id/personalization/:fieldId',
  asyncHandler(async (req, res) => {
    const body = personalizationSchema.partial().parse(req.body);
    const data: Record<string, unknown> = compact(body);
    if (body.options !== undefined) data.options = body.options;

    const field = await prisma.personalizationField.update({
      where: { id: req.params.fieldId },
      data: data as never,
    });
    res.json({ success: true, data: field });
  }),
);

router.post(
  '/:id/personalization/reorder',
  asyncHandler(async (req, res) => {
    const items = req.body?.items as { id: string; sortOrder: number }[] | undefined;
    if (!Array.isArray(items)) throw ApiError.badRequest('items array is required');
    await prisma.$transaction(
      items.map((i) =>
        prisma.personalizationField.update({
          where: { id: i.id },
          data: { sortOrder: Number(i.sortOrder) || 0 },
        }),
      ),
    );
    res.json({ success: true, data: { reordered: items.length } });
  }),
);

router.delete(
  '/:id/personalization/:fieldId',
  asyncHandler(async (req, res) => {
    await prisma.personalizationField.delete({ where: { id: req.params.fieldId } });
    res.json({ success: true, data: { id: req.params.fieldId } });
  }),
);

export default router;
export { toBool };
