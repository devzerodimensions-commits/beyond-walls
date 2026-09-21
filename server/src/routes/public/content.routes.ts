import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../utils/http';
import { getPublicSettings } from '../../services/settings.service';
import { persistUploads, upload } from '../../middleware/upload';
import { getPageWithSections } from '../../services/pageSection.service';
import { sendEnquiryAcknowledgement, sendEnquiryNotification } from '../../services/email.service';
import { getSetting } from '../../services/settings.service';
import { env } from '../../config/env';

const router = Router();
const PUBLISHED = { status: 'PUBLISHED' as const };

// GET /api/settings — everything the storefront needs to render chrome + SEO.
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const [settings, navLinks] = await Promise.all([
      getPublicSettings(),
      prisma.navLink.findMany({
        where: PUBLISHED,
        orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, label: true, href: true, group: true, openInNewTab: true },
      }),
    ]);

    const footerPages = await prisma.page.findMany({
      where: { ...PUBLISHED, showInFooter: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, title: true },
    });

    res.json({ success: true, data: { settings, navLinks, footerPages } });
  }),
);

/**
 * GET /api/home — the full, ordered homepage payload.
 *
 * The homepage is a page like any other now; this endpoint is kept because the
 * storefront and the older clients call it by name.
 */
router.get(
  '/home',
  asyncHandler(async (_req, res) => {
    const page = await getPageWithSections('home');
    res.json({ success: true, data: page?.sections ?? [] });
  }),
);

/**
 * GET /api/pages/:slug/sections — a composed content page.
 *
 * Returns the page with its sections already resolved, so the storefront
 * renders in one pass exactly as the homepage does.
 */
router.get(
  '/pages/:slug/sections',
  asyncHandler(async (req, res) => {
    const page = await getPageWithSections(req.params.slug);
    if (!page) throw ApiError.notFound('Page not found');
    res.json({ success: true, data: page });
  }),
);

// GET /api/pages — footer/nav list
router.get(
  '/pages',
  asyncHandler(async (_req, res) => {
    const pages = await prisma.page.findMany({
      where: PUBLISHED,
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, title: true, excerpt: true, showInFooter: true },
    });
    res.json({ success: true, data: pages });
  }),
);

// GET /api/pages/:slug
router.get(
  '/pages/:slug',
  asyncHandler(async (req, res) => {
    const page = await prisma.page.findFirst({ where: { slug: req.params.slug, ...PUBLISHED } });
    if (!page) throw ApiError.notFound('Page not found');
    res.json({ success: true, data: page });
  }),
);

// GET /api/faqs
router.get(
  '/faqs',
  asyncHandler(async (req, res) => {
    const group = String(req.query.group ?? '').trim();
    const faqs = await prisma.faq.findMany({
      where: { ...PUBLISHED, ...(group ? { group } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, data: faqs });
  }),
);

// GET /api/gallery
router.get(
  '/gallery',
  asyncHandler(async (req, res) => {
    const tag = String(req.query.tag ?? '').trim();
    const items = await prisma.galleryItem.findMany({
      where: { ...PUBLISHED, ...(tag ? { tag } : {}) },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ success: true, data: items });
  }),
);

// GET /api/testimonials
router.get(
  '/testimonials',
  asyncHandler(async (_req, res) => {
    const items = await prisma.testimonial.findMany({ where: PUBLISHED, orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, data: items });
  }),
);

// GET /api/banners?placement=SHOP_TOP
router.get(
  '/banners',
  asyncHandler(async (req, res) => {
    const placement = String(req.query.placement ?? 'HOME_HERO');
    const now = new Date();
    const banners = await prisma.banner.findMany({
      where: {
        ...PUBLISHED,
        placement: placement as never,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ success: true, data: banners });
  }),
);

/**
 * POST /api/uploads/artwork
 * Customer-facing upload used by IMAGE_UPLOAD / FILE_UPLOAD personalization
 * fields, so the artwork is stored before the item reaches the cart and stays
 * attached all the way to the order.
 */
router.post(
  '/uploads/artwork',
  upload.array('attachments', 4),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw ApiError.badRequest('No file was uploaded');

    // Customer artwork: validated by magic bytes before anything is stored.
    const stored = await persistUploads(files, 'artwork', 'personalization');

    const uploaded = [];
    for (const item of stored) {
      await prisma.mediaAsset.upsert({
        where: { url: item.url },
        create: {
          url: item.url,
          filename: item.originalName,
          mimeType: item.mimeType,
          size: item.size,
          folder: 'personalization',
        },
        update: {},
      });
      uploaded.push({ url: item.url, filename: item.originalName, size: item.size, mime: item.mimeType });
    }

    res.status(201).json({ success: true, data: uploaded });
  }),
);

// ---------------------------------------------------------------------------
// Enquiries: contact form, custom order form, price-on-request
// ---------------------------------------------------------------------------

const enquirySchema = z.object({
  type: z.enum(['CONTACT', 'CUSTOM_ORDER', 'PRODUCT_ENQUIRY', 'BULK_ORDER', 'PRICE_REQUEST']).default('CONTACT'),
  name: z.string().min(2, 'Please enter your name').max(80),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().min(6).max(20).optional().nullable(),
  company: z.string().max(120).optional().nullable(),
  subject: z.string().max(160).optional().nullable(),
  message: z.string().min(5, 'Please tell us a little more').max(4000),
  quantity: z.coerce.number().int().positive().optional().nullable(),
  budget: z.string().max(80).optional().nullable(),
  productId: z.string().optional().nullable(),
});

// POST /api/enquiries  (multipart: artwork/reference attachments supported)
router.post(
  '/enquiries',
  upload.array('attachments', 6),
  asyncHandler(async (req, res) => {
    const body = enquirySchema.parse(req.body);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const stored = await persistUploads(files, 'artwork', 'personalization');
    const attachments = stored.map((item) => ({
      url: item.url,
      filename: item.originalName,
      size: item.size,
      mime: item.mimeType,
    }));

    if (stored.length) {
      await prisma.mediaAsset.createMany({
        data: stored.map((item) => ({
          url: item.url,
          filename: item.originalName,
          mimeType: item.mimeType,
          size: item.size,
          folder: 'personalization',
        })),
        skipDuplicates: true,
      });
    }

    // Only link a product that actually exists.
    let productId: string | null = null;
    if (body.productId) {
      const product = await prisma.product.findUnique({ where: { id: body.productId }, select: { id: true } });
      productId = product?.id ?? null;
    }

    const enquiry = await prisma.enquiry.create({
      data: {
        type: body.type,
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        company: body.company ?? null,
        subject: body.subject ?? null,
        message: body.message,
        quantity: body.quantity ?? null,
        budget: body.budget ?? null,
        productId,
        attachments: attachments as never,
      },
      select: { id: true, createdAt: true, type: true },
    });

    // Notify the studio and acknowledge the sender. Both are fire-and-forget,
    // so a mail outage can never lose the enquiry itself.
    const adminEmail =
      env.adminNotificationEmail || (await getSetting<string>('contact.email', ''));
    if (adminEmail) {
      await sendEnquiryNotification(
        {
          type: body.type,
          name: body.name,
          email: body.email,
          phone: body.phone,
          subject: body.subject,
          message: body.message,
        },
        adminEmail,
      );
    }
    await sendEnquiryAcknowledgement({ name: body.name, email: body.email });

    res.status(201).json({
      success: true,
      data: {
        id: enquiry.id,
        message: 'Thank you — we have received your enquiry and will be in touch.',
      },
    });
  }),
);

export default router;
