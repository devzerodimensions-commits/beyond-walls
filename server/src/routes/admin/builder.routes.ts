import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../utils/http';
import {
  PAGE_LAYOUTS,
  WIDGETS,
  WIDGETS_BY_TYPE,
  applyLayout,
  resolveSections,
} from '../../services/pageSection.service';
import { toSlug } from '../../utils/helpers';

/**
 * The visual page builder.
 *
 * Pages themselves are still created and edited through the generic /pages CRUD
 * router; everything here is about the sections that make up a page, plus the
 * catalogue of widgets and ready-made layouts the editor offers.
 */
const router = Router();

const SECTION_TYPES = WIDGETS.map((w) => w.type) as [string, ...string[]];

const sectionSchema = z.object({
  type: z.enum(SECTION_TYPES).optional(),
  title: z.string().max(200).nullable().optional(),
  subtitle: z.string().max(200).nullable().optional(),
  bodyText: z.string().max(5000).nullable().optional(),
  ctaLabel: z.string().max(80).nullable().optional(),
  ctaLink: z.string().max(400).nullable().optional(),
  config: z.record(z.unknown()).optional(),
  sortOrder: z.coerce.number().int().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

/** Fails loudly rather than letting the editor write to a page that is gone. */
async function requirePage(id: string) {
  const page = await prisma.page.findUnique({ where: { id } });
  if (!page) throw ApiError.notFound('Page not found');
  return page;
}

// ---------------------------------------------------------------------------
// GET /admin/builder/widgets — the widget catalogue and the ready-made layouts
//
// The editor builds its own UI from this, so adding a widget on the server is
// enough to make it appear in the admin panel.
// ---------------------------------------------------------------------------
router.get(
  '/widgets',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: { widgets: WIDGETS, layouts: PAGE_LAYOUTS } });
  }),
);

// ---------------------------------------------------------------------------
// GET /admin/builder/pages — everything the Design Pages list shows
// ---------------------------------------------------------------------------
router.get(
  '/pages',
  asyncHandler(async (_req, res) => {
    const pages = await prisma.page.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        isSystem: true,
        showInFooter: true,
        sortOrder: true,
        updatedAt: true,
        _count: { select: { sections: true } },
      },
    });

    res.json({
      success: true,
      data: pages.map((page) => ({
        ...page,
        sectionCount: page._count.sections,
        // The homepage lives at /, everything else at /<slug>.
        path: page.slug === 'home' ? '/' : `/${page.slug}`,
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /admin/builder/pages/:id — a page with its sections, resolved
//
// Resolved in preview mode, so the builder shows draft products and draft
// sections too. An admin needs to see what they are working on, not only what
// is already live.
// ---------------------------------------------------------------------------
router.get(
  '/pages/:id',
  asyncHandler(async (req, res) => {
    const page = await prisma.page.findFirst({
      where: { OR: [{ id: req.params.id }, { slug: req.params.id }] },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!page) throw ApiError.notFound('Page not found');

    const sections = await resolveSections(page.sections, { preview: true });
    res.json({ success: true, data: { ...page, sections } });
  }),
);

// ---------------------------------------------------------------------------
// POST /admin/builder/pages/:id/sections — add a widget
// ---------------------------------------------------------------------------
router.post(
  '/pages/:id/sections',
  asyncHandler(async (req, res) => {
    await requirePage(req.params.id);

    const body = z
      .object({
        type: z.enum(SECTION_TYPES),
        /** Where to drop it. Appends when absent. */
        position: z.coerce.number().int().min(0).optional(),
      })
      .parse(req.body);

    const widget = WIDGETS_BY_TYPE.get(body.type as never);
    const defaults = widget?.defaults ?? {};
    const { config, ...rest } = defaults;

    const count = await prisma.pageSection.count({ where: { pageId: req.params.id } });
    const position = body.position ?? count;

    // Make room, so inserting in the middle does not collide with an existing
    // sortOrder and leave two sections fighting over one slot.
    await prisma.pageSection.updateMany({
      where: { pageId: req.params.id, sortOrder: { gte: position } },
      data: { sortOrder: { increment: 1 } },
    });

    const section = await prisma.pageSection.create({
      data: {
        pageId: req.params.id,
        type: body.type as never,
        sortOrder: position,
        status: 'PUBLISHED',
        ...rest,
        config: (config ?? {}) as Prisma.InputJsonValue,
      },
    });

    const [resolved] = await resolveSections([section], { preview: true });
    res.status(201).json({ success: true, data: resolved });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /admin/builder/pages/:id/sections/:sectionId — edit its fields
// ---------------------------------------------------------------------------
router.patch(
  '/pages/:id/sections/:sectionId',
  asyncHandler(async (req, res) => {
    const body = sectionSchema.parse(req.body);

    const existing = await prisma.pageSection.findFirst({
      where: { id: req.params.sectionId, pageId: req.params.id },
    });
    if (!existing) throw ApiError.notFound('Section not found on this page');

    const section = await prisma.pageSection.update({
      where: { id: req.params.sectionId },
      data: {
        ...body,
        type: body.type as never,
        config: body.config === undefined ? undefined : (body.config as Prisma.InputJsonValue),
      },
    });

    const [resolved] = await resolveSections([section], { preview: true });
    res.json({ success: true, data: resolved });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /admin/builder/pages/:id/sections/:sectionId
// ---------------------------------------------------------------------------
router.delete(
  '/pages/:id/sections/:sectionId',
  asyncHandler(async (req, res) => {
    const existing = await prisma.pageSection.findFirst({
      where: { id: req.params.sectionId, pageId: req.params.id },
    });
    if (!existing) throw ApiError.notFound('Section not found on this page');

    await prisma.pageSection.delete({ where: { id: req.params.sectionId } });

    // Close the gap so the remaining order stays 0,1,2,… rather than drifting.
    await prisma.pageSection.updateMany({
      where: { pageId: req.params.id, sortOrder: { gt: existing.sortOrder } },
      data: { sortOrder: { decrement: 1 } },
    });

    res.json({ success: true, data: { id: req.params.sectionId } });
  }),
);

// ---------------------------------------------------------------------------
// POST /admin/builder/pages/:id/sections/reorder
//
// Takes the whole ordered list rather than a pair to swap: the editor already
// knows the order it wants, and sending it whole cannot drift out of step.
// ---------------------------------------------------------------------------
router.post(
  '/pages/:id/sections/reorder',
  asyncHandler(async (req, res) => {
    const body = z.object({ ids: z.array(z.string().min(1)) }).parse(req.body);

    const owned = await prisma.pageSection.findMany({
      where: { pageId: req.params.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((s) => s.id));
    if (body.ids.some((id) => !ownedIds.has(id))) {
      throw ApiError.badRequest('That section does not belong to this page');
    }

    await prisma.$transaction(
      body.ids.map((id, index) =>
        prisma.pageSection.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    res.json({ success: true, data: { ids: body.ids } });
  }),
);

// ---------------------------------------------------------------------------
// POST /admin/builder/pages/:id/apply-layout — build a page in one click
// ---------------------------------------------------------------------------
router.post(
  '/pages/:id/apply-layout',
  asyncHandler(async (req, res) => {
    await requirePage(req.params.id);

    const body = z
      .object({
        layout: z.string().min(1),
        /** Wipes what is there first. Off by default — it destroys work. */
        replace: z.boolean().default(false),
      })
      .parse(req.body);

    const sections = await applyLayout(req.params.id, body.layout, body.replace);
    if (!sections) throw ApiError.badRequest('That layout does not exist');

    const resolved = await resolveSections(sections, { preview: true });
    res.json({ success: true, data: resolved });
  }),
);

// ---------------------------------------------------------------------------
// POST /admin/builder/pages — create a page from the builder
//
// The generic /pages router can do this too; this exists so "Add new page" is
// one request that also lays down a starting layout.
// ---------------------------------------------------------------------------
router.post(
  '/pages',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1).max(200),
        slug: z.string().max(200).optional(),
        layout: z.string().optional(),
        showInFooter: z.boolean().default(false),
      })
      .parse(req.body);

    const slug = toSlug(body.slug || body.title);
    if (!slug) throw ApiError.badRequest('That title does not make a usable web address');

    const clash = await prisma.page.findUnique({ where: { slug } });
    if (clash) throw ApiError.badRequest(`A page already uses the address /${slug}`);

    const page = await prisma.page.create({
      data: {
        title: body.title,
        slug,
        showInFooter: body.showInFooter,
        // New pages start as drafts, so nothing half-built is ever public.
        status: 'DRAFT',
      },
    });

    if (body.layout) await applyLayout(page.id, body.layout, false);

    res.status(201).json({ success: true, data: page });
  }),
);

export default router;
