import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../utils/http';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import {
  emptyCart,
  priceCart,
  reloadCart,
  resolveCart,
  validatePersonalization,
} from '../../services/cart.service';
import { assertPurchasable, resolveVariant } from '../../services/pricing.service';

const router = Router();

router.use(optionalAuth);

const addItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).nullable().optional(),
  quantity: z.number().int().min(1).max(999).default(1),
  /** Either a { key: value } map or an array of { key, value }. */
  personalization: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
});

// GET /api/cart
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, false);
    if (!cart) return res.json({ success: true, data: emptyCart() });
    const priced = await priceCart(cart);
    return res.json({ success: true, data: priced });
  }),
);

// POST /api/cart/items
router.post(
  '/items',
  asyncHandler(async (req, res) => {
    const body = addItemSchema.parse(req.body);
    const cart = await resolveCart(req, true);
    if (!cart) throw ApiError.badRequest('Could not open a cart');

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      include: { personalization: { orderBy: { sortOrder: 'asc' } }, variants: true },
    });
    if (!product || product.status !== 'PUBLISHED') throw ApiError.notFound('Product is not available');

    /*
     * Variant resolution is strict: a multi-variant product requires an explicit
     * choice, an id belonging to another product is rejected, and a draft variant
     * can never be bought. A single published variant needs no choosing.
     */
    const variant = resolveVariant(product, product.variants, body.variantId);

    // Server-side validation + pricing of the customisation.
    const { entries } = validatePersonalization(product.personalization, body.personalization ?? {});

    // Price, quantity limits and stock are all checked in one place.
    const quantity = assertPurchasable(
      product,
      variant,
      Math.max(product.minOrderQty || 1, body.quantity),
    );

    // Identical personalization + variant merges into the existing line.
    const fingerprint = JSON.stringify(entries.map((e) => [e.key, e.value]));
    const existing = cart.items.find(
      (item) =>
        item.productId === product.id &&
        (item.variantId ?? null) === (variant?.id ?? null) &&
        JSON.stringify(
          ((item.personalization as unknown as { key: string; value: string }[]) ?? []).map((e) => [
            e.key,
            e.value,
          ]),
        ) === fingerprint,
    );

    if (existing) {
      // Re-check the combined quantity against stock and per-order limits.
      const nextQty = assertPurchasable(product, variant, existing.quantity + quantity);
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQty } });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant?.id ?? null,
          quantity,
          personalization: entries as never,
        },
      });
    }

    const priced = await priceCart(await reloadCart(cart.id));
    res.status(201).json({ success: true, data: priced });
  }),
);

// PATCH /api/cart/items/:itemId
router.patch(
  '/items/:itemId',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, false);
    if (!cart) throw ApiError.notFound('Cart not found');

    const item = cart.items.find((i) => i.id === req.params.itemId);
    if (!item) throw ApiError.notFound('Item not found in your cart');

    const schema = z.object({
      quantity: z.number().int().min(1).max(999).optional(),
      personalization: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
    });
    const body = schema.parse(req.body);

    const data: Record<string, unknown> = {};

    if (body.quantity !== undefined) {
      // Same price/limit/stock rules as adding, so the two can never disagree.
      data.quantity = assertPurchasable(item.product, item.variant, body.quantity);
    }

    if (body.personalization !== undefined) {
      const { entries } = validatePersonalization(item.product.personalization, body.personalization);
      data.personalization = entries;
    }

    if (Object.keys(data).length) {
      await prisma.cartItem.update({ where: { id: item.id }, data: data as never });
    }

    const priced = await priceCart(await reloadCart(cart.id));
    res.json({ success: true, data: priced });
  }),
);

// DELETE /api/cart/items/:itemId
router.delete(
  '/items/:itemId',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, false);
    if (!cart) throw ApiError.notFound('Cart not found');
    const item = cart.items.find((i) => i.id === req.params.itemId);
    if (!item) throw ApiError.notFound('Item not found in your cart');

    await prisma.cartItem.delete({ where: { id: item.id } });
    const priced = await priceCart(await reloadCart(cart.id));
    res.json({ success: true, data: priced });
  }),
);

// DELETE /api/cart  — empty the cart
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, false);
    if (!cart) return res.json({ success: true, data: emptyCart() });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    return res.json({ success: true, data: await priceCart(await reloadCart(cart.id)) });
  }),
);

// POST /api/cart/coupon
router.post(
  '/coupon',
  asyncHandler(async (req, res) => {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    if (!code) throw ApiError.badRequest('Enter a coupon code');

    const cart = await resolveCart(req, true);
    if (!cart) throw ApiError.notFound('Cart not found');

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon || coupon.status !== 'PUBLISHED') throw ApiError.badRequest('This coupon code is not valid');

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw ApiError.badRequest('This coupon is not active yet');
    if (coupon.endsAt && coupon.endsAt < now) throw ApiError.badRequest('This coupon has expired');
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw ApiError.badRequest('This coupon has reached its usage limit');
    }

    if (coupon.perUserLimit !== null && req.user?.sub) {
      const used = await prisma.order.count({
        where: { userId: req.user.sub, couponId: coupon.id, status: { not: 'CANCELLED' } },
      });
      if (used >= coupon.perUserLimit) throw ApiError.badRequest('You have already used this coupon');
    }

    await prisma.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id } });
    const priced = await priceCart(await reloadCart(cart.id));

    if (priced.totals.couponMessage) throw ApiError.badRequest(priced.totals.couponMessage);
    res.json({ success: true, data: priced });
  }),
);

// DELETE /api/cart/coupon
router.delete(
  '/coupon',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, false);
    if (!cart) throw ApiError.notFound('Cart not found');
    await prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    res.json({ success: true, data: await priceCart(await reloadCart(cart.id)) });
  }),
);

// ---------------------------------------------------------------------------
// Wishlist (requires an account)
// ---------------------------------------------------------------------------

const wishlistRouter = Router();
wishlistRouter.use(requireAuth);

wishlistRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.wishlistItem.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            compareAtPrice: true,
            status: true,
            stock: true,
            trackInventory: true,
            images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true, alt: true } },
            category: { select: { name: true, slug: true } },
            variants: {
              where: { status: 'PUBLISHED' as const },
              orderBy: { sortOrder: 'asc' as const },
              select: { id: true, label: true, price: true, stock: true },
            },
          },
        },
      },
    });
    res.json({ success: true, data: items.filter((i) => i.product.status === 'PUBLISHED') });
  }),
);

wishlistRouter.post(
  '/:productId',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
    if (!product) throw ApiError.notFound('Product not found');

    const item = await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId: req.user!.sub, productId: product.id } },
      create: { userId: req.user!.sub, productId: product.id },
      update: {},
    });
    res.status(201).json({ success: true, data: item });
  }),
);

wishlistRouter.delete(
  '/:productId',
  asyncHandler(async (req, res) => {
    await prisma.wishlistItem
      .delete({ where: { userId_productId: { userId: req.user!.sub, productId: req.params.productId } } })
      .catch(() => undefined);
    res.json({ success: true, data: { removed: req.params.productId } });
  }),
);

export default router;
export { wishlistRouter };
