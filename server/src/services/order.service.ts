import type { PaymentMethod, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/http';
import { generateOrderNumber, money } from '../utils/helpers';
import { boolSetting, getAllSettings, numberSetting } from './settings.service';
import { priceCart, type CartWithItems, type PersonalizationEntry } from './cart.service';
import { stockMovementFor } from './pricing.service';

export const ORDER_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
  payments: {
    orderBy: { createdAt: 'desc' as const },
    include: { events: { orderBy: { createdAt: 'desc' as const } } },
  },
  coupon: { select: { id: true, code: true, type: true, value: true } },
  user: { select: { id: true, name: true, email: true, phone: true } },
};

export interface AddressInput {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

export interface PlaceOrderInput {
  cart: CartWithItems;
  userId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: AddressInput;
  billingAddress: AddressInput;
  paymentMethod: PaymentMethod;
  customerNote?: string | null;
  gstInvoice?: boolean;
  companyName?: string | null;
  gstin?: string | null;
}

/**
 * Creates the order from a cart inside a transaction:
 * validates availability, re-prices everything server-side, snapshots the
 * customisation onto each line, decrements stock and clears the cart.
 */
export async function placeOrder(input: PlaceOrderInput) {
  const settings = await getAllSettings();

  if (!boolSetting(settings, 'store.enableCheckout', true)) {
    throw new ApiError(503, 'Checkout is currently disabled', 'CHECKOUT_DISABLED');
  }
  if (input.cart.items.length === 0) {
    throw ApiError.badRequest('Your cart is empty');
  }

  const priced = await priceCart(input.cart, { paymentMethod: input.paymentMethod, settings });

  if (priced.totals.hasUnavailableItems) {
    throw ApiError.badRequest(
      'Your cart contains an item that is no longer available. Please remove it and try again.',
    );
  }

  // --- Payment method gates -------------------------------------------------
  if (input.paymentMethod === 'RAZORPAY' && !boolSetting(settings, 'payment.razorpayEnabled', true)) {
    throw ApiError.badRequest('Online payment is currently unavailable');
  }
  if (input.paymentMethod === 'COD') {
    if (!boolSetting(settings, 'payment.codEnabled', false)) {
      throw ApiError.badRequest('Cash on Delivery is not available');
    }
    const min = numberSetting(settings, 'payment.codMinOrder', 0);
    const max = numberSetting(settings, 'payment.codMaxOrder', 0);
    if (min > 0 && priced.totals.total < min) {
      throw ApiError.badRequest(`Cash on Delivery requires an order of at least ₹${min}`);
    }
    if (max > 0 && priced.totals.total > max) {
      throw ApiError.badRequest(`Cash on Delivery is not available on orders above ₹${max}`);
    }
  }

  // --- Stock check ----------------------------------------------------------
  for (const line of priced.lines) {
    if (!line.inStock) {
      throw ApiError.conflict(`"${line.name}" does not have enough stock for the requested quantity`);
    }
    if (line.maxOrderQty && line.quantity > line.maxOrderQty) {
      throw ApiError.badRequest(`"${line.name}" is limited to ${line.maxOrderQty} per order`);
    }
  }

  const orderNumber = generateOrderNumber();

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        userId: input.userId ?? null,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        paymentMethod: input.paymentMethod,
        subtotal: priced.totals.subtotal,
        discountAmount: priced.totals.discount,
        shippingAmount: money(priced.totals.shipping + priced.totals.codFee),
        taxAmount: priced.totals.tax,
        total: priced.totals.total,
        currency: priced.totals.currency,
        couponId: priced.totals.couponCode ? input.cart.couponId : null,
        couponCode: priced.totals.couponCode,
        shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
        billingAddress: input.billingAddress as unknown as Prisma.InputJsonValue,
        customerNote: input.customerNote ?? null,
        gstInvoice: input.gstInvoice ?? false,
        companyName: input.gstInvoice ? (input.companyName ?? null) : null,
        gstin: input.gstInvoice ? (input.gstin?.toUpperCase() ?? null) : null,
        items: {
          create: priced.lines.map((line) => {
            const cartItem = input.cart.items.find((i) => i.id === line.id);
            return {
              productId: line.productId,
              variantId: line.variantId,
              productName: line.name,
              variantLabel: line.variantLabel,
              sku: line.sku,
              imageUrl: line.image,
              slug: line.slug,
              unitPrice: line.unitPrice,
              personalizationCost: line.personalizationCost,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
              personalization: (cartItem?.personalization ?? []) as Prisma.InputJsonValue,
            };
          }),
        },
      },
      include: ORDER_INCLUDE,
    });

    /*
     * Reserve stock. `stockMovementFor` is the only place that decides what
     * moves, so reserving here and releasing on cancel can never disagree:
     *  - inventory tracking off  -> nothing moves at all
     *  - line names a variant    -> the variant row moves
     *  - otherwise               -> the product row moves
     * Never both, which used to double-count variant purchases.
     */
    for (const line of priced.lines) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { id: true, trackInventory: true },
      });
      if (!product) continue;

      const move = stockMovementFor(product, line.variantId, line.quantity, 'reserve');
      if (move.target === 'variant') {
        await tx.productVariant.update({
          where: { id: move.id },
          data: { stock: { increment: move.delta } },
        });
      } else if (move.target === 'product') {
        await tx.product.update({
          where: { id: move.id },
          data: { stock: { increment: move.delta } },
        });
      }
    }

    if (input.cart.couponId && priced.totals.couponCode) {
      await tx.coupon.update({
        where: { id: input.cart.couponId },
        data: { usedCount: { increment: 1 } },
      });
    }

    // Clear the cart now that its contents live on the order.
    await tx.cartItem.deleteMany({ where: { cartId: input.cart.id } });
    await tx.cart.update({ where: { id: input.cart.id }, data: { couponId: null } });

    return created;
  });

  return order;
}

/**
 * Releases reserved stock when an order is cancelled.
 *
 * Mirrors `placeOrder` exactly via `stockMovementFor`, and is guarded by
 * `stockReleasedAt` so a double cancel (admin + customer, or a retried request)
 * cannot inflate inventory.
 */
export async function restoreStockForOrder(orderId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, stockReleasedAt: true },
    });
    if (!order || order.stockReleasedAt) return false;

    const items = await tx.orderItem.findMany({ where: { orderId } });

    for (const item of items) {
      if (!item.productId) continue;
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { id: true, trackInventory: true },
      });
      if (!product) continue;

      const move = stockMovementFor(product, item.variantId, item.quantity, 'release');
      if (move.target === 'variant') {
        await tx.productVariant
          .update({ where: { id: move.id }, data: { stock: { increment: move.delta } } })
          .catch(() => undefined); // variant may have been deleted since
      } else if (move.target === 'product') {
        await tx.product.update({
          where: { id: move.id },
          data: { stock: { increment: move.delta } },
        });
      }
    }

    await tx.order.update({ where: { id: orderId }, data: { stockReleasedAt: new Date() } });
    return true;
  });
}

/** Flat summary used by list views. */
export function summariseOrder(order: {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: Prisma.Decimal;
  currency: string;
  placedAt: Date;
  items: { id: string; productName: string; quantity: number; imageUrl: string | null }[];
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    total: Number(order.total),
    currency: order.currency,
    placedAt: order.placedAt,
    itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
    preview: order.items.slice(0, 3).map((i) => ({
      id: i.id,
      name: i.productName,
      quantity: i.quantity,
      image: i.imageUrl,
    })),
  };
}

/** Human-readable personalization for the admin order screen. */
export function describePersonalization(raw: unknown): string {
  const entries = (Array.isArray(raw) ? raw : []) as PersonalizationEntry[];
  return entries
    .map((e) => `${e.label}: ${e.displayValue ?? e.value}`)
    .join(' · ');
}

export const ORDER_STATUS_FLOW = [
  'PENDING',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
] as const;
