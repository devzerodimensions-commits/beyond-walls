import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { ApiError, asyncHandler, buildPageMeta, parsePagination } from '../../utils/http';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { priceCart, resolveCart } from '../../services/cart.service';
import { ORDER_INCLUDE, placeOrder, restoreStockForOrder, summariseOrder } from '../../services/order.service';
import { boolSetting, getAllSettings, numberSetting } from '../../services/settings.service';
import { createRazorpayOrder, razorpayConfigured } from '../../services/razorpay.service';
import {
  assertOrderAccess,
  confirmPayment,
  paymentExpiry,
  recordPaymentFailure,
} from '../../services/payment.service';
import { env } from '../../config/env';
import { sendOrderConfirmation } from '../../services/email.service';

const router = Router();
router.use(optionalAuth);

/** 15-character GSTIN, validated when a GST invoice is requested. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const addressSchema = z.object({
  fullName: z.string().min(2, 'Enter the recipient name').max(80),
  phone: z.string().min(6, 'Enter a contact number').max(20),
  line1: z.string().min(3, 'Enter the address').max(160),
  line2: z.string().max(160).optional().nullable(),
  landmark: z.string().max(120).optional().nullable(),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  pincode: z.string().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().max(60).default('India'),
});

const checkoutSchema = z.object({
  customerName: z.string().min(2).max(80),
  customerEmail: z.string().email('Enter a valid email address'),
  customerPhone: z.string().min(6).max(20),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  billingSameAsShipping: z.boolean().default(true),
  paymentMethod: z.enum(['RAZORPAY', 'COD']),
  customerNote: z.string().max(1000).optional().nullable(),
  /** GST invoice request. GSTIN is validated only when the box is ticked. */
  gstInvoice: z.boolean().default(false),
  companyName: z.string().max(160).optional().nullable(),
  gstin: z.string().max(20).optional().nullable(),
})
  .refine((v) => !v.gstInvoice || Boolean(v.companyName?.trim()), {
    message: 'Enter the company name for the GST invoice',
    path: ['companyName'],
  })
  .refine(
    (v) => !v.gstInvoice || GSTIN_PATTERN.test((v.gstin ?? '').trim().toUpperCase()),
    { message: 'Enter a valid 15-character GSTIN', path: ['gstin'] },
  );

// ---------------------------------------------------------------------------
// GET /api/checkout/config — which payment options the admin has enabled.
// Only the PUBLIC Razorpay key id is ever sent to the browser.
// ---------------------------------------------------------------------------
router.get(
  '/checkout/config',
  asyncHandler(async (_req, res) => {
    const settings = await getAllSettings();
    const razorpayEnabled = boolSetting(settings, 'payment.razorpayEnabled', true) && razorpayConfigured;

    res.json({
      success: true,
      data: {
        razorpay: {
          enabled: razorpayEnabled,
          configured: razorpayConfigured,
          keyId: razorpayEnabled ? env.razorpayKeyId : null,
          methods: ['upi', 'card', 'netbanking', 'wallet'],
        },
        cod: {
          enabled: boolSetting(settings, 'payment.codEnabled', false),
          fee: numberSetting(settings, 'payment.codFee', 0),
          minOrder: numberSetting(settings, 'payment.codMinOrder', 0),
          maxOrder: numberSetting(settings, 'payment.codMaxOrder', 0),
          note: settings['payment.codNote'] ?? '',
        },
        checkoutEnabled: boolSetting(settings, 'store.enableCheckout', true),
        currency: settings['payment.currency'] ?? 'INR',
        shippingNote: settings['shipping.note'] ?? '',
      },
    });
  }),
);

// GET /api/checkout/summary?paymentMethod=COD — totals incl. COD fee
router.get(
  '/checkout/summary',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, false);
    if (!cart || cart.items.length === 0) throw ApiError.badRequest('Your cart is empty');
    const paymentMethod = String(req.query.paymentMethod ?? 'RAZORPAY') === 'COD' ? 'COD' : 'RAZORPAY';
    const priced = await priceCart(cart, { paymentMethod });
    res.json({ success: true, data: priced });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/orders — create the order, then (for Razorpay) a payment intent.
// ---------------------------------------------------------------------------
router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const body = checkoutSchema.parse(req.body);

    const cart = await resolveCart(req, false);
    if (!cart || cart.items.length === 0) throw ApiError.badRequest('Your cart is empty');

    const billing = body.billingSameAsShipping
      ? body.shippingAddress
      : (body.billingAddress ?? body.shippingAddress);

    const order = await placeOrder({
      cart,
      userId: req.user?.sub,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      shippingAddress: body.shippingAddress,
      billingAddress: billing,
      paymentMethod: body.paymentMethod,
      customerNote: body.customerNote,
      gstInvoice: body.gstInvoice,
      companyName: body.companyName,
      gstin: body.gstin,
    });

    // --- Cash on delivery: confirmed immediately ---------------------------
    if (body.paymentMethod === 'COD') {
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'cod',
          method: 'COD',
          status: 'PENDING',
          amount: order.total,
          currency: order.currency,
          events: {
            create: { type: 'ORDER_CREATED', message: 'Cash on delivery order placed' },
          },
        },
      });
      const confirmed = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
        include: ORDER_INCLUDE,
      });
      await sendOrderConfirmation(confirmed as never, env.publicSiteUrl);

      return res.status(201).json({
        success: true,
        data: { order: confirmed, payment: { id: payment.id, method: 'COD' }, razorpay: null },
      });
    }

    /*
     * Razorpay: create the gateway order server-side.
     *
     * If Razorpay refuses, the local order is already holding reserved stock —
     * so we roll it back rather than leaving an unpayable order behind.
     */
    let rzpOrder;
    try {
      rzpOrder = await createRazorpayOrder({
        amount: Number(order.total),
        receipt: order.orderNumber,
        notes: { orderId: order.id, orderNumber: order.orderNumber },
      });
    } catch (err) {
      await restoreStockForOrder(order.id);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'FAILED',
          cancelledAt: new Date(),
          adminNote: 'Cancelled automatically: Razorpay order could not be created.',
        },
      });
      throw new ApiError(
        502,
        'We could not reach the payment gateway. Nothing has been charged — please try again.',
        'RAZORPAY_UNAVAILABLE',
        err instanceof Error ? { detail: err.message } : undefined,
      );
    }

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'razorpay',
        method: 'RAZORPAY',
        status: 'PENDING',
        amount: order.total,
        currency: order.currency,
        razorpayOrderId: rzpOrder.id,
        // Abandoned attempts are swept after this, releasing the reservation.
        expiresAt: paymentExpiry(),
        events: {
          create: {
            type: 'ORDER_CREATED',
            message: `Razorpay order ${rzpOrder.id} created`,
            payload: { razorpayOrderId: rzpOrder.id, amount: rzpOrder.amount } as never,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        order,
        payment: { id: payment.id, method: 'RAZORPAY' },
        razorpay: {
          keyId: env.razorpayKeyId, // public key only
          orderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
        },
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/payments/verify
//
// Every check in verifyPaymentStrict must pass before an order is marked paid:
// signature, our own razorpay order id, Razorpay's record, captured status,
// exact amount in paise and currency. There is no fallback path.
// ---------------------------------------------------------------------------
router.post(
  '/payments/verify',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      orderId: z.string().min(1),
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().min(1),
      razorpaySignature: z.string().min(1),
    });
    const body = schema.parse(req.body);

    const result = await confirmPayment({
      orderId: body.orderId,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      signature: body.razorpaySignature,
    });

    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      include: ORDER_INCLUDE,
    });

    // Only on the first successful confirmation, never on a repeat callback.
    if (order && !result.alreadyPaid) {
      await sendOrderConfirmation(order as never, env.publicSiteUrl);
    }

    res.json({
      success: true,
      data: { order, payment: { id: result.payment.id, status: result.payment.status }, alreadyPaid: result.alreadyPaid },
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/payments/failed
//
// Requires proof of ownership (signed-in owner, or the exact email for a guest
// order) and refuses to downgrade a payment that already succeeded.
// ---------------------------------------------------------------------------
router.post(
  '/payments/failed',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      orderId: z.string().min(1),
      email: z.string().email().optional(),
      code: z.string().max(80).optional().nullable(),
      description: z.string().max(500).optional().nullable(),
      razorpayPaymentId: z.string().max(80).optional().nullable(),
    });
    const body = schema.parse(req.body);

    const outcome = await recordPaymentFailure({
      orderId: body.orderId,
      code: body.code,
      description: body.description,
      razorpayPaymentId: body.razorpayPaymentId,
      actor: { userId: req.user?.sub, email: body.email },
    });

    res.json({ success: true, data: { recorded: !outcome.ignored, ...outcome } });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/payments/retry/:orderId — new Razorpay order for an unpaid order.
// ---------------------------------------------------------------------------
router.post(
  '/payments/retry/:orderId',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
    if (!order) throw ApiError.notFound('Order not found');

    // Same ownership rule as everywhere else: account owner, or guest email.
    assertOrderAccess(order, {
      userId: req.user?.sub,
      email: String(req.body?.email ?? ''),
      isAdmin: req.user?.role === 'ADMIN',
    });

    if (order.paymentStatus === 'PAID') throw ApiError.badRequest('This order is already paid');
    if (order.status === 'CANCELLED') throw ApiError.badRequest('This order has been cancelled');
    if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) {
      throw ApiError.badRequest('This order has been refunded and cannot be paid again');
    }

    // Close any attempt still hanging around so only one is ever live.
    await prisma.payment.updateMany({
      where: { orderId: order.id, method: 'RAZORPAY', status: 'PENDING' },
      data: { status: 'CANCELLED', errorCode: 'SUPERSEDED', errorDescription: 'Replaced by a retry' },
    });

    const settings = await getAllSettings();
    if (!boolSetting(settings, 'payment.razorpayEnabled', true) || !razorpayConfigured) {
      throw ApiError.badRequest('Online payment is currently unavailable');
    }

    const rzpOrder = await createRazorpayOrder({
      amount: Number(order.total),
      receipt: `${order.orderNumber}-R`,
      notes: { orderId: order.id, orderNumber: order.orderNumber, retry: 'true' },
    });

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'razorpay',
        method: 'RAZORPAY',
        status: 'PENDING',
        amount: order.total,
        currency: order.currency,
        razorpayOrderId: rzpOrder.id,
        expiresAt: paymentExpiry(),
        events: {
          create: {
            type: 'RETRY',
            message: `Retry — Razorpay order ${rzpOrder.id} created`,
            payload: { razorpayOrderId: rzpOrder.id } as never,
          },
        },
      },
    });

    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PENDING' } });

    res.json({
      success: true,
      data: {
        payment: { id: payment.id },
        razorpay: {
          keyId: env.razorpayKeyId,
          orderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
        },
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          total: Number(order.total),
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
        },
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Customer order history
// ---------------------------------------------------------------------------

// GET /api/orders — signed-in customer's orders
router.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query as Record<string, unknown>, 10, 50);
    const where = { userId: req.user!.sub };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip,
        take,
        include: { items: true },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      data: orders.map(summariseOrder),
      meta: buildPageMeta(page, perPage, total),
    });
  }),
);

// GET /api/orders/:idOrNumber — detail (owner, or guest via ?email=)
router.get(
  '/orders/:idOrNumber',
  asyncHandler(async (req, res) => {
    const key = req.params.idOrNumber;
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: key }, { orderNumber: key }] },
      include: ORDER_INCLUDE,
    });
    if (!order) throw ApiError.notFound('Order not found');

    assertOrderAccess(order, {
      userId: req.user?.sub,
      email: String(req.query.email ?? ''),
      isAdmin: req.user?.role === 'ADMIN',
    });

    res.json({ success: true, data: order });
  }),
);

// POST /api/orders/:id/cancel — customer cancels a not-yet-shipped order
router.post(
  '/orders/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw ApiError.notFound('Order not found');
    if (order.userId !== req.user!.sub) throw ApiError.forbidden();

    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      throw ApiError.badRequest('This order can no longer be cancelled online. Please contact us.');
    }

    await restoreStockForOrder(order.id);
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: ORDER_INCLUDE,
    });

    res.json({ success: true, data: updated });
  }),
);

// ---------------------------------------------------------------------------
// Customer addresses
// ---------------------------------------------------------------------------

const addressRouter = Router();
addressRouter.use(requireAuth);

addressRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user!.sub },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ success: true, data: addresses });
  }),
);

addressRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = addressSchema.extend({ isDefault: z.boolean().default(false) }).parse(req.body);
    if (body.isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user!.sub }, data: { isDefault: false } });
    }
    const address = await prisma.address.create({
      data: { ...body, line2: body.line2 ?? null, landmark: body.landmark ?? null, userId: req.user!.sub },
    });
    res.status(201).json({ success: true, data: address });
  }),
);

addressRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user!.sub) throw ApiError.notFound('Address not found');

    const body = addressSchema.partial().extend({ isDefault: z.boolean().optional() }).parse(req.body);
    if (body.isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user!.sub }, data: { isDefault: false } });
    }
    const address = await prisma.address.update({ where: { id: req.params.id }, data: body });
    res.json({ success: true, data: address });
  }),
);

addressRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user!.sub) throw ApiError.notFound('Address not found');
    await prisma.address.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { id: req.params.id } });
  }),
);

export default router;
export { addressRouter };
