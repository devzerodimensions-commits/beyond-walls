import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError, asyncHandler, buildPageMeta, parsePagination } from '../../utils/http';
import { getSetting } from '../../services/settings.service';

const router = Router();

const PUBLISHED = { status: 'PUBLISHED' as const };

const PRODUCT_CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  shortDescription: true,
  price: true,
  compareAtPrice: true,
  priceConfirmed: true,
  stock: true,
  trackInventory: true,
  featured: true,
  isNew: true,
  badge: true,
  livePreviewEnabled: true,
  widthInches: true,
  heightInches: true,
  createdAt: true,
  images: { orderBy: { sortOrder: 'asc' as const }, select: { url: true, alt: true, isPrimary: true } },
  category: { select: { id: true, name: true, slug: true } },
  subcategory: { select: { id: true, name: true, slug: true } },
  variants: {
    where: PUBLISHED,
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, label: true, price: true, stock: true },
  },
  attributes: {
    select: {
      value: {
        select: {
          id: true,
          name: true,
          slug: true,
          hexColor: true,
          group: { select: { id: true, name: true, slug: true, kind: true } },
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

export interface BudgetBand {
  slug: string;
  label: string;
  min: number | null;
  max: number | null;
  /** When true, `min` is exclusive — so Premium does not overlap Under-2499. */
  minExclusive?: boolean;
}

/** Budget bands come from the categories brief and are editable in Admin → Settings. */
export const DEFAULT_BUDGET_BANDS: BudgetBand[] = [
  { slug: 'under-999', label: 'Under ₹999', min: null, max: 999 },
  { slug: 'under-1999', label: 'Under ₹1,999', min: null, max: 1999 },
  { slug: 'under-2499', label: 'Under ₹2,499', min: null, max: 2499 },
  // Exclusive lower bound: a product priced exactly 2499 belongs to
  // "Under 2499", not to Premium.
  { slug: 'premium', label: 'Over ₹2,499', min: 2499, max: null, minExclusive: true },
];

async function budgetBands(): Promise<BudgetBand[]> {
  const stored = await getSetting<BudgetBand[] | null>('store.budgetBands', null);
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_BUDGET_BANDS;
}

function splitCsv(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((v) => String(v).trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// GET /api/catalog/categories  — full published tree
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      where: { ...PUBLISHED, parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        children: {
          where: PUBLISHED,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: { _count: { select: { products: true } } },
        },
        _count: { select: { products: true } },
      },
    });
    res.json({ success: true, data: categories });
  }),
);

// GET /api/catalog/categories/:slug
router.get(
  '/categories/:slug',
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
      where: { slug: req.params.slug, ...PUBLISHED },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          where: PUBLISHED,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: { _count: { select: { products: true } } },
        },
      },
    });
    if (!category) throw ApiError.notFound('Category not found');
    res.json({ success: true, data: category });
  }),
);

// ---------------------------------------------------------------------------
// Filter rails
// ---------------------------------------------------------------------------

// GET /api/catalog/filters?category=for-home
router.get(
  '/filters',
  asyncHandler(async (req, res) => {
    const categorySlug = String(req.query.category ?? '').trim();

    // Restrict attribute values to those actually present in the category.
    let productScope: Prisma.ProductWhereInput = PUBLISHED;
    if (categorySlug) {
      const category = await prisma.category.findUnique({
        where: { slug: categorySlug },
        select: { id: true, children: { select: { id: true } } },
      });
      if (category) {
        const ids = [category.id, ...category.children.map((c) => c.id)];
        productScope = {
          ...PUBLISHED,
          OR: [{ categoryId: { in: ids } }, { subcategoryId: { in: ids } }],
        };
      }
    }

    const groups = await prisma.attributeGroup.findMany({
      where: { ...PUBLISHED, showInFilter: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        values: {
          where: PUBLISHED,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            _count: { select: { products: true } },
          },
        },
      },
    });

    // Count only products matching the current scope.
    const scopedCounts = await prisma.productAttribute.groupBy({
      by: ['valueId'],
      where: { product: productScope },
      _count: { valueId: true },
    });
    const countMap = new Map(scopedCounts.map((c) => [c.valueId, c._count.valueId]));

    const filters = groups
      .map((group) => ({
        id: group.id,
        name: group.name,
        slug: group.slug,
        kind: group.kind,
        multiSelect: group.multiSelect,
        helpText: group.helpText,
        values: group.values
          .map((v) => ({
            id: v.id,
            name: v.name,
            slug: v.slug,
            hexColor: v.hexColor,
            count: countMap.get(v.id) ?? 0,
          }))
          .filter((v) => (categorySlug ? v.count > 0 : true)),
      }))
      .filter((g) => g.values.length > 0);

    const priceRange = await prisma.product.aggregate({
      where: { ...productScope, price: { not: null } },
      _min: { price: true },
      _max: { price: true },
    });

    res.json({
      success: true,
      data: {
        attributes: filters,
        budgetBands: await budgetBands(),
        priceRange: {
          min: priceRange._min.price ? Number(priceRange._min.price) : 0,
          max: priceRange._max.price ? Number(priceRange._max.price) : 0,
        },
        sortOptions: [
          { value: 'featured', label: 'Featured' },
          { value: 'newest', label: 'Newest first' },
          { value: 'price-asc', label: 'Price: low to high' },
          { value: 'price-desc', label: 'Price: high to low' },
          { value: 'name-asc', label: 'Name: A–Z' },
        ],
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * GET /api/catalog/products
 * Query: page, perPage, search, category, subcategory, attr (repeatable slugs),
 *        budget, minPrice, maxPrice, sort, featured, inStock
 */
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query as Record<string, unknown>, 12, 60);
    const q = req.query as Record<string, unknown>;

    const where: Prisma.ProductWhereInput = { ...PUBLISHED };
    const and: Prisma.ProductWhereInput[] = [];

    // --- Explicit slug list (used by "recently viewed") ---
    const slugs = splitCsv(q.slugs);
    if (slugs.length) {
      const items = await prisma.product.findMany({
        where: { ...PUBLISHED, slug: { in: slugs.slice(0, 12) } },
        select: PRODUCT_CARD_SELECT,
      });
      // Preserve the caller's order, which is most-recent-first.
      const ordered = slugs
        .map((slug) => items.find((p) => p.slug === slug))
        .filter((p): p is (typeof items)[number] => Boolean(p));
      return res.json({
        success: true,
        data: ordered,
        meta: buildPageMeta(1, ordered.length || 1, ordered.length),
      });
    }

    // --- Search ---
    const search = String(q.search ?? q.q ?? '').trim();
    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { shortDescription: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { seoKeywords: { contains: search, mode: 'insensitive' } },
          { category: { name: { contains: search, mode: 'insensitive' } } },
          { attributes: { some: { value: { name: { contains: search, mode: 'insensitive' } } } } },
        ],
      });
    }

    // --- Category (includes children) ---
    const categorySlug = String(q.category ?? '').trim();
    if (categorySlug) {
      const category = await prisma.category.findUnique({
        where: { slug: categorySlug },
        select: { id: true, children: { select: { id: true } } },
      });
      if (!category) {
        return res.json({ success: true, data: [], meta: buildPageMeta(page, perPage, 0) });
      }
      const ids = [category.id, ...category.children.map((c) => c.id)];
      and.push({ OR: [{ categoryId: { in: ids } }, { subcategoryId: { in: ids } }] });
    }

    const subcategorySlug = String(q.subcategory ?? '').trim();
    if (subcategorySlug) {
      const sub = await prisma.category.findUnique({
        where: { slug: subcategorySlug },
        select: { id: true },
      });
      if (sub) and.push({ OR: [{ subcategoryId: sub.id }, { categoryId: sub.id }] });
    }

    // --- Attribute facets: every selected group must match (AND across groups,
    //     OR within a group) ---
    const attrSlugs = splitCsv(q.attr ?? q.attributes);
    if (attrSlugs.length) {
      const values = await prisma.attributeValue.findMany({
        where: { slug: { in: attrSlugs }, ...PUBLISHED },
        select: { id: true, slug: true, groupId: true },
      });
      const byGroup = new Map<string, string[]>();
      for (const v of values) {
        byGroup.set(v.groupId, [...(byGroup.get(v.groupId) ?? []), v.id]);
      }
      for (const ids of byGroup.values()) {
        and.push({ attributes: { some: { valueId: { in: ids } } } });
      }
    }

    // --- Budget bands / explicit price range ---
    const budgetSlugs = splitCsv(q.budget);
    if (budgetSlugs.length) {
      const bands = (await budgetBands()).filter((b) => budgetSlugs.includes(b.slug));
      if (bands.length) {
        and.push({
          OR: bands.map((band) => {
            const price: Prisma.DecimalFilter = {};
            if (band.min !== null) {
              if (band.minExclusive) price.gt = band.min;
              else price.gte = band.min;
            }
            if (band.max !== null) price.lte = band.max;
            return { price };
          }),
        });
      }
    }

    const minPrice = Number(q.minPrice);
    const maxPrice = Number(q.maxPrice);
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      const price: Prisma.DecimalFilter = {};
      if (Number.isFinite(minPrice)) price.gte = minPrice;
      if (Number.isFinite(maxPrice)) price.lte = maxPrice;
      and.push({ price });
    }

    if (String(q.featured ?? '') === 'true') and.push({ featured: true });
    if (String(q.inStock ?? '') === 'true') {
      and.push({ OR: [{ trackInventory: false }, { stock: { gt: 0 } }] });
    }
    if (String(q.livePreview ?? '') === 'true') and.push({ livePreviewEnabled: true });

    if (and.length) where.AND = and;

    // --- Sorting ---
    const sort = String(q.sort ?? 'featured');
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = (() => {
      switch (sort) {
        case 'price-asc':
          return [{ price: 'asc' }, { name: 'asc' }];
        case 'price-desc':
          return [{ price: 'desc' }, { name: 'asc' }];
        case 'newest':
          return [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
        case 'name-asc':
          return [{ name: 'asc' }];
        default:
          return [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }];
      }
    })();

    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy, skip, take, select: PRODUCT_CARD_SELECT }),
      prisma.product.count({ where }),
    ]);

    return res.json({ success: true, data: items, meta: buildPageMeta(page, perPage, total) });
  }),
);

// GET /api/catalog/products/search-suggest?q=name
router.get(
  '/products/search-suggest',
  asyncHandler(async (req, res) => {
    const term = String(req.query.q ?? '').trim();
    if (term.length < 2) return res.json({ success: true, data: { products: [], categories: [] } });

    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: {
          ...PUBLISHED,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { shortDescription: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 6,
        orderBy: { featured: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true, alt: true } },
          // Needed so the suggestion can show a price that lives on a variant.
          variants: {
            where: PUBLISHED,
            orderBy: { sortOrder: 'asc' },
            select: { price: true, status: true },
          },
        },
      }),
      prisma.category.findMany({
        where: { ...PUBLISHED, name: { contains: term, mode: 'insensitive' } },
        take: 4,
        select: { id: true, name: true, slug: true },
      }),
    ]);

    return res.json({ success: true, data: { products, categories } });
  }),
);

// GET /api/catalog/products/:slug
router.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, ...PUBLISHED },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: PUBLISHED, orderBy: { sortOrder: 'asc' } },
        personalization: { where: PUBLISHED, orderBy: { sortOrder: 'asc' } },
        category: { select: { id: true, name: true, slug: true, parent: { select: { name: true, slug: true } } } },
        subcategory: { select: { id: true, name: true, slug: true } },
        attributes: {
          select: {
            value: {
              select: {
                id: true,
                name: true,
                slug: true,
                hexColor: true,
                group: { select: { id: true, name: true, slug: true, kind: true } },
              },
            },
          },
        },
        reviews: {
          where: PUBLISHED,
          orderBy: { createdAt: 'desc' },
          select: { id: true, authorName: true, rating: true, title: true, content: true, createdAt: true },
        },
      },
    });
    if (!product) throw ApiError.notFound('Product not found');

    // Related products from the same category.
    const related = await prisma.product.findMany({
      where: {
        ...PUBLISHED,
        id: { not: product.id },
        OR: [
          { categoryId: product.categoryId ?? undefined },
          { subcategoryId: product.subcategoryId ?? undefined },
        ],
      },
      take: 4,
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      select: PRODUCT_CARD_SELECT,
    });

    res.json({ success: true, data: { ...product, related } });
  }),
);

export default router;
export { PRODUCT_CARD_SELECT };
