import { Router } from 'express';
import prisma from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../utils/http';
import { createCrudRouter } from '../../utils/crudFactory';
import { uniqueSlug, toSlug } from '../../utils/helpers';
import { deleteFileIfUnreferenced } from '../../services/media.service';

const router = Router();

// ---------------------------------------------------------------------------
// Categories & subcategories
// ---------------------------------------------------------------------------
const categories = createCrudRouter({
  model: 'category',
  searchFields: ['name', 'slug', 'description'],
  hasStatus: true,
  hasSortOrder: true,
  slugFrom: 'name',
  slugModel: 'category',
  include: {
    parent: { select: { id: true, name: true, slug: true } },
    _count: { select: { products: true, children: true } },
  },
  writableFields: [
    'name', 'slug', 'description', 'shortText', 'image', 'bannerImage', 'icon',
    'parentId', 'sortOrder', 'status', 'featured', 'showInMenu',
    'seoTitle', 'seoDescription', 'seoKeywords', 'ogImage',
  ],
  numberFields: ['sortOrder'],
  booleanFields: ['featured', 'showInMenu'],
  beforeWrite: async (data, _req, _mode, existingId) => {
    // A category cannot be its own parent.
    if (existingId && data.parentId === existingId) {
      throw ApiError.badRequest('A category cannot be its own parent');
    }
    return data;
  },
  beforeDelete: async (record) => {
    const category = record as { id: string; image: string | null; bannerImage: string | null };
    const children = await prisma.category.count({ where: { parentId: category.id } });
    if (children > 0) {
      throw ApiError.badRequest(
        'This category has subcategories. Move or delete them first.',
      );
    }
    // The file is only removed if nothing else still points at it.
    await deleteFileIfUnreferenced(category.image, { model: 'category', id: category.id });
    await deleteFileIfUnreferenced(category.bannerImage, { model: 'category', id: category.id });
  },
});
router.use('/categories', categories);

/** GET /admin/categories-tree — nested picker for the product form. */
router.get(
  '/categories-tree',
  asyncHandler(async (_req, res) => {
    const tree = await prisma.category.findMany({
      where: { parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        children: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        _count: { select: { products: true } },
      },
    });
    res.json({ success: true, data: tree });
  }),
);

// ---------------------------------------------------------------------------
// Attribute groups (Materials, Styles, Shapes, Professions, Requirements...)
// ---------------------------------------------------------------------------
router.use(
  '/attribute-groups',
  createCrudRouter({
    model: 'attributeGroup',
    searchFields: ['name', 'slug'],
    hasStatus: true,
    hasSortOrder: true,
    slugFrom: 'name',
    slugModel: 'attributeGroup',
    include: {
      values: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      _count: { select: { values: true } },
    },
    writableFields: ['name', 'slug', 'kind', 'helpText', 'sortOrder', 'status', 'showInFilter', 'multiSelect'],
    numberFields: ['sortOrder'],
    booleanFields: ['showInFilter', 'multiSelect'],
  }),
);

// Attribute values are nested under their group.
router.get(
  '/attribute-values',
  asyncHandler(async (req, res) => {
    const groupId = String(req.query.groupId ?? '');
    const values = await prisma.attributeValue.findMany({
      where: groupId ? { groupId } : {},
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { group: { select: { id: true, name: true, slug: true } }, _count: { select: { products: true } } },
    });
    res.json({ success: true, data: values });
  }),
);

router.post(
  '/attribute-values',
  asyncHandler(async (req, res) => {
    const { groupId, name, hexColor, image, sortOrder, status } = req.body ?? {};
    if (!groupId || !name) throw ApiError.badRequest('groupId and name are required');

    const group = await prisma.attributeGroup.findUnique({ where: { id: String(groupId) } });
    if (!group) throw ApiError.notFound('Attribute group not found');

    // Slugs are unique per group.
    let slug = toSlug(String(req.body.slug || name));
    let counter = 2;
    while (await prisma.attributeValue.findFirst({ where: { groupId: group.id, slug } })) {
      slug = `${toSlug(String(name))}-${counter++}`;
    }

    const value = await prisma.attributeValue.create({
      data: {
        groupId: group.id,
        name: String(name),
        slug,
        hexColor: hexColor ? String(hexColor) : null,
        image: image ? String(image) : null,
        sortOrder: Number(sortOrder) || 0,
        status: (status as never) ?? 'PUBLISHED',
      },
    });
    res.status(201).json({ success: true, data: value });
  }),
);

router.patch(
  '/attribute-values/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.attributeValue.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound('Attribute value not found');

    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = String(req.body.name);
    if (req.body.slug !== undefined || req.body.name !== undefined) {
      let slug = toSlug(String(req.body.slug || req.body.name || existing.name));
      let counter = 2;
      // eslint-disable-next-line no-await-in-loop
      while (
        await prisma.attributeValue.findFirst({
          where: { groupId: existing.groupId, slug, id: { not: existing.id } },
        })
      ) {
        slug = `${toSlug(String(req.body.name || existing.name))}-${counter++}`;
      }
      data.slug = slug;
    }
    if (req.body.hexColor !== undefined) data.hexColor = req.body.hexColor || null;
    if (req.body.image !== undefined) data.image = req.body.image || null;
    if (req.body.sortOrder !== undefined) data.sortOrder = Number(req.body.sortOrder) || 0;
    if (req.body.status !== undefined) data.status = req.body.status;

    const value = await prisma.attributeValue.update({ where: { id: existing.id }, data: data as never });
    res.json({ success: true, data: value });
  }),
);

router.post(
  '/attribute-values/reorder',
  asyncHandler(async (req, res) => {
    const items = req.body?.items as { id: string; sortOrder: number }[] | undefined;
    if (!Array.isArray(items)) throw ApiError.badRequest('items array is required');
    await prisma.$transaction(
      items.map((i) =>
        prisma.attributeValue.update({ where: { id: i.id }, data: { sortOrder: Number(i.sortOrder) || 0 } }),
      ),
    );
    res.json({ success: true, data: { reordered: items.length } });
  }),
);

router.delete(
  '/attribute-values/:id',
  asyncHandler(async (req, res) => {
    await prisma.attributeValue.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { id: req.params.id } });
  }),
);

// ---------------------------------------------------------------------------
// Homepage sections
//
// Removed: the homepage is an ordinary page now and its blocks are edited in
// Admin -> Design Pages, through /admin/builder. See pageSection.service.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------
router.use(
  '/banners',
  createCrudRouter({
    model: 'banner',
    searchFields: ['title', 'subtitle'],
    hasStatus: true,
    hasSortOrder: true,
    writableFields: [
      'title', 'subtitle', 'eyebrow', 'image', 'mobileImage', 'link', 'ctaLabel',
      'placement', 'sortOrder', 'status', 'startsAt', 'endsAt',
    ],
    numberFields: ['sortOrder'],
    dateFields: ['startsAt', 'endsAt'],
    buildWhere: (req) => (req.query.placement ? { placement: String(req.query.placement) } : {}),
    beforeDelete: async (record) => {
      const banner = record as { id: string; image: string | null; mobileImage: string | null };
      await deleteFileIfUnreferenced(banner.image, { model: 'banner', id: banner.id });
      await deleteFileIfUnreferenced(banner.mobileImage, { model: 'banner', id: banner.id });
    },
  }),
);

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------
router.use(
  '/gallery',
  createCrudRouter({
    model: 'galleryItem',
    searchFields: ['title', 'caption', 'tag'],
    hasStatus: true,
    hasSortOrder: true,
    writableFields: ['title', 'caption', 'image', 'tag', 'link', 'sortOrder', 'status'],
    numberFields: ['sortOrder'],
    beforeDelete: async (record) => {
      const item = record as { id: string; image: string };
      await deleteFileIfUnreferenced(item.image, { model: 'galleryItem', id: item.id });
    },
  }),
);

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------
router.use(
  '/testimonials',
  createCrudRouter({
    model: 'testimonial',
    searchFields: ['name', 'content', 'role'],
    hasStatus: true,
    hasSortOrder: true,
    writableFields: ['name', 'role', 'location', 'content', 'rating', 'image', 'sortOrder', 'status'],
    numberFields: ['rating', 'sortOrder'],
  }),
);

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------
router.use(
  '/faqs',
  createCrudRouter({
    model: 'faq',
    searchFields: ['question', 'answer', 'group'],
    hasStatus: true,
    hasSortOrder: true,
    writableFields: ['question', 'answer', 'group', 'sortOrder', 'status'],
    numberFields: ['sortOrder'],
  }),
);

// ---------------------------------------------------------------------------
// Pages (about / contact / policies)
// ---------------------------------------------------------------------------
router.use(
  '/pages',
  createCrudRouter({
    model: 'page',
    searchFields: ['title', 'slug', 'content'],
    hasStatus: true,
    hasSortOrder: true,
    slugFrom: 'title',
    slugModel: 'page',
    writableFields: [
      'title', 'slug', 'excerpt', 'content', 'heroImage', 'status', 'showInFooter', 'sortOrder',
      'seoTitle', 'seoDescription', 'seoKeywords', 'ogImage',
    ],
    numberFields: ['sortOrder'],
    booleanFields: ['showInFooter'],
    beforeWrite: async (data, _req, mode, existingId) => {
      if (mode === 'update' && existingId) {
        const existing = await prisma.page.findUnique({ where: { id: existingId } });
        // A system page is linked to by name from elsewhere in the site, so its
        // address is held. Everything else about it stays editable.
        if (existing?.isSystem) delete data.slug;
      }
      return data;
    },
    beforeDelete: (record) => {
      const page = record as { title?: string; isSystem?: boolean } | null;
      if (page?.isSystem) {
        throw ApiError.badRequest(
          `"${page.title}" is part of the site's structure and cannot be deleted. Unpublish it instead.`,
        );
      }
    },
  }),
);

// ---------------------------------------------------------------------------
// Navigation links
// ---------------------------------------------------------------------------
router.use(
  '/nav-links',
  createCrudRouter({
    model: 'navLink',
    searchFields: ['label', 'href', 'group'],
    hasStatus: true,
    hasSortOrder: true,
    writableFields: ['label', 'href', 'group', 'sortOrder', 'status', 'openInNewTab'],
    numberFields: ['sortOrder'],
    booleanFields: ['openInNewTab'],
    buildWhere: (req) => (req.query.group ? { group: String(req.query.group) } : {}),
  }),
);

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------
router.use(
  '/coupons',
  createCrudRouter({
    model: 'coupon',
    searchFields: ['code', 'description'],
    hasStatus: true,
    writableFields: [
      'code', 'description', 'type', 'value', 'minOrderValue', 'maxDiscount',
      'usageLimit', 'perUserLimit', 'startsAt', 'endsAt', 'status',
    ],
    numberFields: ['value', 'minOrderValue', 'maxDiscount', 'usageLimit', 'perUserLimit'],
    dateFields: ['startsAt', 'endsAt'],
    beforeWrite: (data) => {
      if (typeof data.code === 'string') data.code = data.code.trim().toUpperCase();
      return data;
    },
  }),
);

// ---------------------------------------------------------------------------
// Reviews (moderation)
// ---------------------------------------------------------------------------
router.use(
  '/reviews',
  createCrudRouter({
    model: 'review',
    searchFields: ['authorName', 'title', 'content'],
    hasStatus: true,
    include: { product: { select: { id: true, name: true, slug: true } } },
    writableFields: ['productId', 'authorName', 'rating', 'title', 'content', 'status'],
    numberFields: ['rating'],
  }),
);

export default router;
export { uniqueSlug };
