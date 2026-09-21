import type { Request } from 'express';
import type { Prisma, PersonalizationField, Product, ProductVariant } from '@prisma/client';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/http';
import { money } from '../utils/helpers';
import { boolSetting, getAllSettings, numberSetting, type SettingsMap } from './settings.service';
import { availableStock, effectivePrice } from './pricing.service';

export const CART_INCLUDE = {
  coupon: true,
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: true,
      product: {
        include: {
          images: { orderBy: { sortOrder: 'asc' as const } },
          category: { select: { id: true, name: true, slug: true } },
          personalization: { orderBy: { sortOrder: 'asc' as const } },
        },
      },
    },
  },
};

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

/** A single personalization answer as stored on the cart/order item. */
export interface PersonalizationEntry {
  key: string;
  label: string;
  type: string;
  value: string;
  /** Human-readable label of the chosen option, when different from value. */
  displayValue?: string;
  priceDelta: number;
  previewSlot?: string | null;
}

interface FieldOption {
  label?: string;
  value?: string;
  hex?: string;
  priceDelta?: number | string;
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s()]{6,20}$/;

/**
 * Validates the customer's personalization answers against the product's
 * admin-defined fields and returns normalised entries with their price deltas.
 * This runs server-side so the price can never be tampered with client-side.
 */
export function validatePersonalization(
  fields: PersonalizationField[],
  submitted: unknown,
): { entries: PersonalizationEntry[]; totalDelta: number } {
  const answers: Record<string, unknown> = {};

  if (Array.isArray(submitted)) {
    for (const item of submitted as { key?: string; value?: unknown }[]) {
      if (item && typeof item.key === 'string') answers[item.key] = item.value;
    }
  } else if (submitted && typeof submitted === 'object') {
    Object.assign(answers, submitted as Record<string, unknown>);
  }

  const entries: PersonalizationEntry[] = [];
  let totalDelta = 0;

  const active = fields.filter((f) => f.status === 'PUBLISHED');

  for (const field of active) {
    const raw = answers[field.key];
    const value = raw === null || raw === undefined ? '' : String(raw).trim();

    if (!value) {
      if (field.required) {
        throw ApiError.unprocessable(`"${field.label}" is required`, { field: field.key });
      }
      continue;
    }

    if (field.maxLength && value.length > field.maxLength) {
      throw ApiError.unprocessable(`"${field.label}" must be ${field.maxLength} characters or fewer`, {
        field: field.key,
      });
    }
    if (field.minLength && value.length < field.minLength) {
      throw ApiError.unprocessable(`"${field.label}" must be at least ${field.minLength} characters`, {
        field: field.key,
      });
    }
    if (field.pattern) {
      try {
        if (!new RegExp(field.pattern).test(value)) {
          throw ApiError.unprocessable(`"${field.label}" is not in the expected format`, { field: field.key });
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        // An invalid admin-entered regex must not break checkout.
      }
    }

    switch (field.type) {
      case 'GSTIN':
        if (!GSTIN_PATTERN.test(value.toUpperCase())) {
          throw ApiError.unprocessable(`"${field.label}" must be a valid 15-character GSTIN`, {
            field: field.key,
          });
        }
        break;
      case 'EMAIL':
        if (!EMAIL_PATTERN.test(value)) {
          throw ApiError.unprocessable(`"${field.label}" must be a valid email address`, { field: field.key });
        }
        break;
      case 'PHONE':
        if (!PHONE_PATTERN.test(value)) {
          throw ApiError.unprocessable(`"${field.label}" must be a valid phone number`, { field: field.key });
        }
        break;
      case 'URL':
        try {
          // eslint-disable-next-line no-new
          new URL(value);
        } catch {
          throw ApiError.unprocessable(`"${field.label}" must be a valid URL (including https://)`, {
            field: field.key,
          });
        }
        break;
      case 'NUMBER':
        if (!Number.isFinite(Number(value))) {
          throw ApiError.unprocessable(`"${field.label}" must be a number`, { field: field.key });
        }
        break;
      default:
        break;
    }

    let delta = Number(field.priceDelta ?? 0);
    let displayValue: string | undefined;

    if (['SELECT', 'RADIO', 'COLOR', 'FONT'].includes(field.type)) {
      const options = (Array.isArray(field.options) ? field.options : []) as FieldOption[];
      if (options.length) {
        const match = options.find((o) => String(o.value ?? o.label) === value);
        if (!match) {
          throw ApiError.unprocessable(`"${value}" is not an available option for ${field.label}`, {
            field: field.key,
          });
        }
        if (match.priceDelta !== undefined && match.priceDelta !== null) {
          delta += Number(match.priceDelta) || 0;
        }
        if (match.label && match.label !== value) displayValue = match.label;
      }
    }

    totalDelta += delta;
    entries.push({
      key: field.key,
      label: field.label,
      type: field.type,
      value: field.type === 'GSTIN' ? value.toUpperCase() : value,
      ...(displayValue ? { displayValue } : {}),
      priceDelta: money(delta),
      previewSlot: field.previewSlot,
    });
  }

  return { entries, totalDelta: money(totalDelta) };
}

/** @deprecated Use `effectivePrice` from pricing.service — kept as a re-export. */
export const unitPriceFor = effectivePrice;

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  sku: string | null;
  variantLabel: string | null;
  image: string | null;
  quantity: number;
  unitPrice: number;
  personalizationCost: number;
  lineTotal: number;
  personalization: PersonalizationEntry[];
  /** True when the catalogue entry has lost its price since it was added. */
  unavailable: boolean;
  inStock: boolean;
  availableStock: number | null;
  maxOrderQty: number | null;
  categorySlug: string | null;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  tax: number;
  total: number;
  itemCount: number;
  currency: string;
  couponCode: string | null;
  couponMessage: string | null;
  freeShippingThreshold: number;
  /** True when a line can no longer be priced and must be removed. */
  hasUnavailableItems: boolean;
}

export interface PricedCart {
  id: string;
  lines: CartLine[];
  totals: CartTotals;
}

function primaryImage(product: { images?: { url: string; isPrimary: boolean; sortOrder: number }[] }): string | null {
  const images = product.images ?? [];
  if (!images.length) return null;
  const primary = images.find((i) => i.isPrimary);
  return (primary ?? images[0]).url;
}

/** Turns a DB cart into priced lines plus totals. */
export async function priceCart(
  cart: CartWithItems,
  options: { paymentMethod?: 'RAZORPAY' | 'COD'; settings?: SettingsMap } = {},
): Promise<PricedCart> {
  const settings = options.settings ?? (await getAllSettings());
  const currency = String(settings['payment.currency'] ?? 'INR');

  const lines: CartLine[] = [];
  let subtotal = 0;
  let itemCount = 0;
  let hasUnavailableItems = false;

  for (const item of cart.items) {
    const { product, variant } = item;
    const base = effectivePrice(product, variant);
    const personalization = (Array.isArray(item.personalization)
      ? item.personalization
      : []) as unknown as PersonalizationEntry[];
    const personalizationCost = money(
      personalization.reduce((sum, entry) => sum + (Number(entry.priceDelta) || 0), 0),
    );

    // A line can only lose its price if the catalogue changed after it was
    // added. It is surfaced so the customer can remove it, never silently sold.
    const unavailable = base === null;
    const unitPrice = unavailable ? 0 : money((base ?? 0) + personalizationCost);
    const lineTotal = money(unitPrice * item.quantity);

    if (unavailable) hasUnavailableItems = true;
    else subtotal += lineTotal;
    itemCount += item.quantity;

    // Stock is only meaningful when the product tracks inventory.
    const stock = availableStock(product, variant);

    lines.push({
      id: item.id,
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name,
      slug: product.slug,
      sku: variant?.sku ?? product.sku,
      variantLabel: variant?.label ?? null,
      image: variant?.image ?? primaryImage(product),
      quantity: item.quantity,
      unitPrice,
      personalizationCost,
      lineTotal,
      personalization,
      unavailable,
      inStock: stock === null || stock >= item.quantity,
      availableStock: stock,
      maxOrderQty: product.maxOrderQty,
      categorySlug: product.category?.slug ?? null,
    });
  }

  subtotal = money(subtotal);

  // --- Coupon ---------------------------------------------------------------
  let discount = 0;
  let couponMessage: string | null = null;
  let freeShipping = false;
  const coupon = cart.coupon;

  if (coupon) {
    const now = new Date();
    const expired = coupon.endsAt ? coupon.endsAt < now : false;
    const notStarted = coupon.startsAt ? coupon.startsAt > now : false;
    const exhausted = coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit;
    const belowMin = coupon.minOrderValue !== null && subtotal < Number(coupon.minOrderValue);

    if (coupon.status !== 'PUBLISHED' || expired || notStarted || exhausted) {
      couponMessage = 'This coupon is no longer valid.';
    } else if (belowMin) {
      couponMessage = `Add ${currency} ${money(Number(coupon.minOrderValue) - subtotal)} more to use ${coupon.code}.`;
    } else if (coupon.type === 'PERCENT') {
      discount = money((subtotal * Number(coupon.value)) / 100);
      if (coupon.maxDiscount !== null) discount = Math.min(discount, Number(coupon.maxDiscount));
    } else if (coupon.type === 'FIXED') {
      discount = Math.min(money(Number(coupon.value)), subtotal);
    } else if (coupon.type === 'FREE_SHIPPING') {
      freeShipping = true;
    }
  }

  // --- Shipping -------------------------------------------------------------
  const flatRate = numberSetting(settings, 'shipping.flatRate', 0);
  const freeAbove = numberSetting(settings, 'shipping.freeAbove', 0);
  const taxable = money(subtotal - discount);

  let shipping = flatRate;
  if (freeShipping) shipping = 0;
  else if (freeAbove > 0 && taxable >= freeAbove) shipping = 0;
  else if (freeAbove === 0 && flatRate === 0) shipping = 0;
  if (lines.length === 0) shipping = 0;

  // --- COD fee --------------------------------------------------------------
  const codFee = options.paymentMethod === 'COD' ? numberSetting(settings, 'payment.codFee', 0) : 0;

  // --- Tax ------------------------------------------------------------------
  const pricesIncludeTax = boolSetting(settings, 'tax.pricesIncludeTax', true);
  let tax = 0;
  if (!pricesIncludeTax) {
    for (const line of lines) {
      if (line.unavailable) continue;
      const product = cart.items.find((i) => i.id === line.id)?.product;
      const rate = Number(product?.taxRatePercent ?? 18);
      const share = subtotal > 0 ? line.lineTotal / subtotal : 0;
      const lineAfterDiscount = line.lineTotal - discount * share;
      tax += (lineAfterDiscount * rate) / 100;
    }
    tax = money(tax);
  }

  const total = money(Math.max(0, taxable + shipping + codFee + tax));

  return {
    id: cart.id,
    lines,
    totals: {
      subtotal,
      discount: money(discount),
      shipping: money(shipping),
      codFee: money(codFee),
      tax,
      total,
      itemCount,
      currency,
      couponCode: coupon && !couponMessage ? coupon.code : null,
      couponMessage,
      freeShippingThreshold: freeAbove,
      hasUnavailableItems,
    },
  };
}

/** Finds (or creates) the cart belonging to the current user or session token. */
export async function resolveCart(req: Request, create = true): Promise<CartWithItems | null> {
  const userId = req.user?.sub;
  const sessionId = (req.headers['x-cart-session'] as string | undefined)?.trim();

  if (userId) {
    let cart = await prisma.cart.findFirst({ where: { userId }, include: CART_INCLUDE });

    // On login, merge the anonymous cart into the user's cart.
    if (sessionId) {
      const guestCart = await prisma.cart.findUnique({ where: { sessionId }, include: CART_INCLUDE });
      if (guestCart && guestCart.id !== cart?.id) {
        if (!cart) {
          cart = await prisma.cart.update({
            where: { id: guestCart.id },
            data: { userId, sessionId: null },
            include: CART_INCLUDE,
          });
        } else {
          await prisma.cartItem.updateMany({ where: { cartId: guestCart.id }, data: { cartId: cart.id } });
          await prisma.cart.delete({ where: { id: guestCart.id } });
          cart = await prisma.cart.findUnique({ where: { id: cart.id }, include: CART_INCLUDE });
        }
      }
    }

    if (!cart && create) {
      cart = await prisma.cart.create({ data: { userId }, include: CART_INCLUDE });
    }
    return cart;
  }

  if (!sessionId) {
    if (!create) return null;
    throw ApiError.badRequest('Missing x-cart-session header for the guest cart');
  }

  let cart = await prisma.cart.findUnique({ where: { sessionId }, include: CART_INCLUDE });
  if (!cart && create) {
    cart = await prisma.cart.create({ data: { sessionId }, include: CART_INCLUDE });
  }
  return cart;
}

export async function reloadCart(cartId: string): Promise<CartWithItems> {
  const cart = await prisma.cart.findUnique({ where: { id: cartId }, include: CART_INCLUDE });
  if (!cart) throw ApiError.notFound('Cart not found');
  return cart;
}

/** Empty-cart payload so the storefront always receives a consistent shape. */
export function emptyCart(): PricedCart {
  return {
    id: '',
    lines: [],
    totals: {
      subtotal: 0,
      discount: 0,
      shipping: 0,
      codFee: 0,
      tax: 0,
      total: 0,
      itemCount: 0,
      currency: 'INR',
      couponCode: null,
      couponMessage: null,
      freeShippingThreshold: 0,
      hasUnavailableItems: false,
    },
  };
}
