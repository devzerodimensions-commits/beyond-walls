import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ApiError, asyncHandler, buildPageMeta, parsePagination } from '../../utils/http';
import { ORDER_INCLUDE, restoreStockForOrder } from '../../services/order.service';
import { issueRefund } from '../../services/payment.service';
import { hashPassword } from '../../utils/auth';
import {
  SETTING_DEFINITIONS,
  getAllSettings,
  getSetting,
  setSettings,
} from '../../services/settings.service';
import { persistUploads, resolveFolder, upload, deleteUploadedFile, UPLOAD_FOLDERS } from '../../middleware/upload';
import { fileReferenceCount } from '../../services/media.service';
import { emailConfigured, sendOrderStatusUpdate } from '../../services/email.service';
import { razorpayConfigured } from '../../services/razorpay.service';
import { env } from '../../config/env';

const router = Router();

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30 = new Date(now.getTime() - 30 * 86_400_000);

    const [
      orderCount,
      pendingOrders,
      productCount,
      draftProducts,
      customerCount,
      newEnquiries,
      revenueAgg,
      monthRevenueAgg,
      lowStock,
      recentOrders,
      recentEnquiries,
      statusBreakdown,
      unconfirmedPrices,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: { in: ['PENDING', 'CONFIRMED', 'IN_PRODUCTION'] } } }),
      prisma.product.count(),
      prisma.product.count({ where: { status: 'DRAFT' } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.enquiry.count({ where: { status: 'NEW' } }),
      prisma.order.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { total: true } }),
      prisma.order.aggregate({
        where: { paymentStatus: 'PAID', placedAt: { gte: startOfMonth } },
        _sum: { total: true },
      }),
      prisma.product.findMany({
        where: { trackInventory: true, stock: { lte: 5 }, status: 'PUBLISHED' },
        select: { id: true, name: true, slug: true, stock: true, lowStockAlert: true },
        take: 8,
        orderBy: { stock: 'asc' },
      }),
      prisma.order.findMany({
        take: 8,
        orderBy: { placedAt: 'desc' },
        select: {
          id: true, orderNumber: true, customerName: true, total: true,
          status: true, paymentStatus: true, paymentMethod: true, placedAt: true,
        },
      }),
      prisma.enquiry.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, type: true, subject: true, status: true, createdAt: true },
      }),
      prisma.order.groupBy({ by: ['status'], _count: { status: true } }),
      // Seeded placeholder prices that nobody has confirmed yet. These are live
      // and sellable, so they need to be checked before the store opens.
      prisma.product.findMany({
        where: { priceConfirmed: false, status: 'PUBLISHED' },
        select: { id: true, name: true, slug: true, price: true },
        orderBy: { name: 'asc' },
        take: 20,
      }),
    ]);

    // Daily revenue for the last 30 days, for the dashboard chart.
    const recentPaid = await prisma.order.findMany({
      where: { paymentStatus: 'PAID', placedAt: { gte: last30 } },
      select: { total: true, placedAt: true },
    });
    const byDay = new Map<string, number>();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * 86_400_000);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const order of recentPaid) {
      const key = order.placedAt.toISOString().slice(0, 10);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + Number(order.total));
    }

    res.json({
      success: true,
      data: {
        counts: {
          orders: orderCount,
          pendingOrders,
          products: productCount,
          draftProducts,
          customers: customerCount,
          newEnquiries,
        },
        revenue: {
          allTime: Number(revenueAgg._sum.total ?? 0),
          thisMonth: Number(monthRevenueAgg._sum.total ?? 0),
        },
        revenueSeries: [...byDay.entries()].map(([date, value]) => ({ date, value })),
        statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: s._count.status })),
        lowStock,
        recentOrders,
        recentEnquiries,
        // Things that must be settled before the store goes live.
        launchChecks: {
          unconfirmedPrices: unconfirmedPrices.map((p) => ({ ...p, price: Number(p.price) })),
          domainConfirmed: Boolean(await getSetting('seo.domainConfirmed', false)),
          siteUrl: String(await getSetting('seo.siteUrl', '')),
          razorpayConfigured,
          emailConfigured,
        },
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query as Record<string, unknown>, 25, 200);
    const q = req.query as Record<string, unknown>;

    const where: Prisma.OrderWhereInput = {};
    const search = String(q.search ?? '').trim();
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (q.status) where.status = String(q.status) as never;
    if (q.paymentStatus) where.paymentStatus = String(q.paymentStatus) as never;
    if (q.paymentMethod) where.paymentMethod = String(q.paymentMethod) as never;
    if (q.from || q.to) {
      where.placedAt = {
        ...(q.from ? { gte: new Date(String(q.from)) } : {}),
        ...(q.to ? { lte: new Date(`${String(q.to)}T23:59:59.999Z`) } : {}),
      };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip,
        take,
        include: {
          items: { select: { id: true, productName: true, quantity: true, imageUrl: true } },
          payments: { select: { id: true, status: true, instrument: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ success: true, data: orders, meta: buildPageMeta(page, perPage, total) });
  }),
);

router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: req.params.id }, { orderNumber: req.params.id }] },
      include: ORDER_INCLUDE,
    });
    if (!order) throw ApiError.notFound('Order not found');
    res.json({ success: true, data: order });
  }),
);

router.patch(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      status: z
        .enum(['PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'])
        .optional(),
      paymentStatus: z
        .enum(['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'])
        .optional(),
      adminNote: z.string().max(2000).nullable().optional(),
      trackingNumber: z.string().max(120).nullable().optional(),
      trackingUrl: z.string().max(400).nullable().optional(),
      courierName: z.string().max(120).nullable().optional(),
    });
    const body = schema.parse(req.body);

    const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound('Order not found');

    const data: Record<string, unknown> = { ...body };

    /*
     * Cancelling an order that has money against it must not silently strand
     * the customer's payment — refund it first, then cancel.
     */
    if (body.status === 'CANCELLED' && existing.status !== 'CANCELLED') {
      const captured = await prisma.payment.findFirst({
        where: { orderId: existing.id, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
      });
      if (captured && Number(captured.refundedAmount) < Number(captured.amount)) {
        throw ApiError.badRequest(
          'This order has a captured payment. Refund it first — the order is then cancelled automatically.',
        );
      }
    }

    // Stamp the lifecycle timestamps as the status advances.
    if (body.status && body.status !== existing.status) {
      if (body.status === 'CONFIRMED' && !existing.confirmedAt) data.confirmedAt = new Date();
      if (body.status === 'SHIPPED' && !existing.shippedAt) data.shippedAt = new Date();
      if (body.status === 'DELIVERED' && !existing.deliveredAt) data.deliveredAt = new Date();
      if (body.status === 'CANCELLED') {
        data.cancelledAt = new Date();
        if (existing.status !== 'CANCELLED') await restoreStockForOrder(existing.id);
      }
    }

    const order = await prisma.order.update({
      where: { id: existing.id },
      data: data as never,
      include: ORDER_INCLUDE,
    });

    // Tell the customer, but only when the status actually moved.
    if (body.status && body.status !== existing.status) {
      await sendOrderStatusUpdate(order as never, env.publicSiteUrl);
    }

    res.json({ success: true, data: order });
  }),
);

/**
 * POST /admin/orders/:id/refund — full or partial Razorpay refund.
 *
 * Delegates to issueRefund, which sends Razorpay an idempotency key and stores
 * the resulting refund id behind a unique constraint. A double-clicked button
 * or a retried request therefore cannot refund twice.
 */
router.post(
  '/orders/:id/refund',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      amount: z.coerce.number().positive().optional(),
      reason: z.string().max(200).optional(),
    });
    const body = schema.parse(req.body ?? {});

    const result = await issueRefund({
      orderId: req.params.id,
      amount: body.amount,
      reason: body.reason,
    });

    const updated = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: ORDER_INCLUDE,
    });

    res.json({
      success: true,
      data: updated,
      message: result.duplicate
        ? 'This refund was already recorded — nothing was charged again.'
        : undefined,
    });
  }),
);

/** GET /admin/orders-export.csv */
router.get(
  '/orders-export.csv',
  asyncHandler(async (req, res) => {
    const where: Prisma.OrderWhereInput = {};
    if (req.query.status) where.status = String(req.query.status) as never;

    const orders = await prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      include: { items: true },
      take: 5000,
    });

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'Order Number', 'Date', 'Customer', 'Email', 'Phone', 'Status', 'Payment Status',
      'Payment Method', 'Items', 'Subtotal', 'Discount', 'Shipping', 'Tax', 'Total',
      'Customisation',
    ].join(',');

    const rows = orders.map((o) =>
      [
        o.orderNumber,
        o.placedAt.toISOString(),
        o.customerName,
        o.customerEmail,
        o.customerPhone,
        o.status,
        o.paymentStatus,
        o.paymentMethod,
        o.items.map((i) => `${i.quantity}x ${i.productName}`).join(' | '),
        Number(o.subtotal),
        Number(o.discountAmount),
        Number(o.shippingAmount),
        Number(o.taxAmount),
        Number(o.total),
        o.items
          .map((i) =>
            ((i.personalization as unknown as { label: string; value: string }[]) ?? [])
              .map((p) => `${p.label}=${p.value}`)
              .join('; '),
          )
          .filter(Boolean)
          .join(' || '),
      ]
        .map(escape)
        .join(','),
    );

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="beyond-walls-orders-${Date.now()}.csv"`);
    res.send([header, ...rows].join('\n'));
  }),
);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
router.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query as Record<string, unknown>, 25, 200);
    const search = String(req.query.search ?? '').trim();

    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (req.query.role) where.role = String(req.query.role) as never;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true, name: true, email: true, phone: true, role: true,
          isActive: true, createdAt: true, lastLoginAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ success: true, data: users, meta: buildPageMeta(page, perPage, total) });
  }),
);

router.get(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        isActive: true, createdAt: true, lastLoginAt: true,
        addresses: true,
        orders: {
          orderBy: { placedAt: 'desc' },
          select: {
            id: true, orderNumber: true, total: true, status: true,
            paymentStatus: true, placedAt: true,
          },
        },
        wishlist: { include: { product: { select: { id: true, name: true, slug: true } } } },
      },
    });
    if (!user) throw ApiError.notFound('Customer not found');

    const spend = await prisma.order.aggregate({
      where: { userId: user.id, paymentStatus: 'PAID' },
      _sum: { total: true },
      _count: true,
    });

    res.json({
      success: true,
      data: { ...user, lifetimeValue: Number(spend._sum.total ?? 0), paidOrders: spend._count },
    });
  }),
);

router.patch(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      phone: z.string().max(20).nullable().optional(),
      role: z.enum(['CUSTOMER', 'ADMIN']).optional(),
      isActive: z.boolean().optional(),
      password: z.string().min(8).max(100).optional(),
    });
    const body = schema.parse(req.body);

    // Never allow the last active admin to be demoted or disabled.
    if (body.role === 'CUSTOMER' || body.isActive === false) {
      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (target?.role === 'ADMIN') {
        const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (admins <= 1) throw ApiError.badRequest('You cannot remove the last active admin account');
      }
    }

    const { password, ...rest } = body;
    const data: Record<string, unknown> = { ...rest };
    if (password) data.passwordHash = await hashPassword(password);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: data as never,
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
    });
    res.json({ success: true, data: user });
  }),
);

router.post(
  '/customers',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80),
      email: z.string().email().toLowerCase(),
      password: z.string().min(8).max(100),
      phone: z.string().max(20).nullable().optional(),
      role: z.enum(['CUSTOMER', 'ADMIN']).default('CUSTOMER'),
    });
    const body = schema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw ApiError.conflict('An account with this email already exists');

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        role: body.role,
        passwordHash: await hashPassword(body.password),
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    res.status(201).json({ success: true, data: user });
  }),
);

router.delete(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { orders: true } } },
    });
    if (!target) throw ApiError.notFound('Customer not found');

    if (target.role === 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (admins <= 1) throw ApiError.badRequest('You cannot delete the last active admin account');
    }
    if (target._count.orders > 0) {
      // Keep order history intact — disable instead of destroying.
      const disabled = await prisma.user.update({
        where: { id: target.id },
        data: { isActive: false },
        select: { id: true, isActive: true },
      });
      return res.json({
        success: true,
        data: disabled,
        message: 'This customer has orders, so the account was deactivated instead of deleted.',
      });
    }

    await prisma.user.delete({ where: { id: target.id } });
    return res.json({ success: true, data: { id: target.id } });
  }),
);

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------
router.get(
  '/enquiries',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query as Record<string, unknown>, 25, 200);
    const where: Prisma.EnquiryWhereInput = {};

    const search = String(req.query.search ?? '').trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (req.query.status) where.status = String(req.query.status) as never;
    if (req.query.type) where.type = String(req.query.type) as never;

    const [items, total] = await Promise.all([
      prisma.enquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { product: { select: { id: true, name: true, slug: true } } },
      }),
      prisma.enquiry.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: buildPageMeta(page, perPage, total) });
  }),
);

router.get(
  '/enquiries/:id',
  asyncHandler(async (req, res) => {
    const enquiry = await prisma.enquiry.findUnique({
      where: { id: req.params.id },
      include: { product: { select: { id: true, name: true, slug: true } } },
    });
    if (!enquiry) throw ApiError.notFound('Enquiry not found');
    res.json({ success: true, data: enquiry });
  }),
);

router.patch(
  '/enquiries/:id',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      status: z.enum(['NEW', 'IN_PROGRESS', 'QUOTED', 'CLOSED', 'SPAM']).optional(),
      adminNote: z.string().max(4000).nullable().optional(),
    });
    const body = schema.parse(req.body);
    const enquiry = await prisma.enquiry.update({ where: { id: req.params.id }, data: body });
    res.json({ success: true, data: enquiry });
  }),
);

router.delete(
  '/enquiries/:id',
  asyncHandler(async (req, res) => {
    const enquiry = await prisma.enquiry.findUnique({ where: { id: req.params.id } });
    if (!enquiry) throw ApiError.notFound('Enquiry not found');

    for (const file of (enquiry.attachments as unknown as { url: string }[]) ?? []) {
      if (file?.url) deleteUploadedFile(file.url);
    }
    await prisma.enquiry.delete({ where: { id: enquiry.id } });
    res.json({ success: true, data: { id: enquiry.id } });
  }),
);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const values = await getAllSettings();
    res.json({
      success: true,
      data: {
        values,
        definitions: SETTING_DEFINITIONS.map(({ key, group, label }) => ({ key, group, label })),
        groups: [...new Set(SETTING_DEFINITIONS.map((d) => d.group))],
      },
    });
  }),
);

router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const values = req.body?.values;
    if (!values || typeof values !== 'object') throw ApiError.badRequest('values object is required');

    // Guard: secrets are configured through .env only, never through the panel.
    const blocked = Object.keys(values).filter((k) => /secret|password|apiKey/i.test(k));
    if (blocked.length) {
      throw ApiError.badRequest(
        `These values are configured in the server .env file, not the admin panel: ${blocked.join(', ')}`,
      );
    }

    await setSettings(values as Record<string, unknown>);
    res.json({ success: true, data: await getAllSettings() });
  }),
);

// ---------------------------------------------------------------------------
// Media library
// ---------------------------------------------------------------------------
router.get(
  '/media',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query as Record<string, unknown>, 40, 200);
    const where: Prisma.MediaAssetWhereInput = {};
    if (req.query.folder) where.folder = String(req.query.folder);
    if (req.query.search) where.filename = { contains: String(req.query.search), mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.mediaAsset.count({ where }),
    ]);

    res.json({
      success: true,
      data: items,
      meta: { ...buildPageMeta(page, perPage, total), folders: UPLOAD_FOLDERS },
    });
  }),
);

router.post(
  '/media',
  upload.array('files', 12),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw ApiError.badRequest('No files were uploaded');

    const folder = resolveFolder(req.body?.folder);
    const stored = await persistUploads(files, 'image', folder);

    const created = [];
    for (const item of stored) {
      created.push(
        await prisma.mediaAsset.upsert({
          where: { url: item.url },
          create: {
            url: item.url,
            filename: item.originalName,
            mimeType: item.mimeType,
            size: item.size,
            folder,
            alt: String(req.body?.alt ?? ''),
          },
          update: {},
        }),
      );
    }

    res.status(201).json({ success: true, data: created });
  }),
);

router.patch(
  '/media/:id',
  asyncHandler(async (req, res) => {
    const asset = await prisma.mediaAsset.update({
      where: { id: req.params.id },
      data: { alt: req.body?.alt ?? null, folder: req.body?.folder ?? undefined },
    });
    res.json({ success: true, data: asset });
  }),
);

router.delete(
  '/media/:id',
  asyncHandler(async (req, res) => {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw ApiError.notFound('Media not found');

    // Refuse to break a live reference anywhere in the site, not just products.
    const inUse = await fileReferenceCount(asset.url);
    if (inUse > 0) {
      throw ApiError.badRequest(
        `This file is still used in ${inUse} place(s) — a product, category, banner, gallery item, page or setting. Remove it there first.`,
      );
    }

    await prisma.mediaAsset.delete({ where: { id: asset.id } });
    deleteUploadedFile(asset.url);
    res.json({ success: true, data: { id: asset.id } });
  }),
);

export default router;
