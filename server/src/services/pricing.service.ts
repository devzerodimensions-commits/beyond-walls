import type { Product, ProductVariant } from '@prisma/client';
import { ApiError } from '../utils/http';

/**
 * Single source of truth for "what does this cost and can it be bought".
 *
 * Beyond Walls sells catalogue products directly: every published product must
 * resolve to a price. A product may price itself (`product.price`) or delegate
 * to its variants (`variant.price`) — but something must resolve, or the
 * product is not sellable and must not be published.
 */

type PricedProduct = Pick<Product, 'id' | 'name' | 'price' | 'trackInventory' | 'stock' | 'minOrderQty' | 'maxOrderQty'>;
type PricedVariant = Pick<ProductVariant, 'id' | 'label' | 'price' | 'stock' | 'status'>;

/** Variants a customer is allowed to choose. */
export function sellableVariants<T extends { status: string }>(variants: T[]): T[] {
  return variants.filter((v) => v.status === 'PUBLISHED');
}

/**
 * The price for a product/variant pair.
 * Variant price wins; otherwise the product's own price; otherwise null.
 */
export function effectivePrice(
  product: Pick<Product, 'price'>,
  variant?: Pick<ProductVariant, 'price'> | null,
): number | null {
  if (variant && variant.price !== null && variant.price !== undefined) return Number(variant.price);
  if (product.price !== null && product.price !== undefined) return Number(product.price);
  return null;
}

/** Lowest resolvable price across a product, used for cards and listings. */
export function displayPriceRange(
  product: Pick<Product, 'price'>,
  variants: Pick<ProductVariant, 'price' | 'status'>[],
): { min: number | null; max: number | null; varies: boolean } {
  const published = variants.filter((v) => v.status === 'PUBLISHED');
  const prices = published
    .map((v) => effectivePrice(product, v))
    .filter((p): p is number => p !== null);

  // No variants at all — the product price is the only candidate.
  if (!published.length) {
    const base = product.price !== null && product.price !== undefined ? Number(product.price) : null;
    return { min: base, max: base, varies: false };
  }
  if (!prices.length) return { min: null, max: null, varies: false };

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, varies: min !== max };
}

/**
 * A product is sellable when at least one purchase path resolves to a price.
 * Used by the admin publish guard and by the storefront to decide whether the
 * buy box is live.
 */
export function isSellable(
  product: Pick<Product, 'price'>,
  variants: Pick<ProductVariant, 'price' | 'status'>[],
): boolean {
  return displayPriceRange(product, variants).min !== null;
}

/**
 * Resolves and validates the exact variant for an add-to-cart request.
 *
 * Rules:
 *  - a product with published variants REQUIRES one to be chosen; we only fall
 *    back to a default when the product itself defines a single default variant
 *  - a variant id that does not belong to this product is rejected outright
 *  - a draft/archived variant can never be purchased
 */
export function resolveVariant(
  product: { id: string; name: string },
  variants: PricedVariant[],
  requestedId?: string | null,
): PricedVariant | null {
  const sellable = sellableVariants(variants);

  if (requestedId) {
    const match = sellable.find((v) => v.id === requestedId);
    if (!match) {
      // Either unknown, belongs to another product, or is not published.
      throw ApiError.badRequest('The selected option is not available for this product');
    }
    return match;
  }

  if (!sellable.length) return null;

  // Exactly one option means there is nothing to choose.
  if (sellable.length === 1) return sellable[0];

  throw ApiError.badRequest(`Choose an option for "${product.name}" before adding it to the cart`);
}

/** Stock available for a product/variant pair; null means "not tracked". */
export function availableStock(
  product: Pick<Product, 'trackInventory' | 'stock'>,
  variant?: Pick<ProductVariant, 'stock'> | null,
): number | null {
  if (!product.trackInventory) return null;
  return variant ? variant.stock : product.stock;
}

/**
 * Checks a requested quantity against stock and per-order limits.
 * Throws with a customer-readable message; returns the clamped quantity.
 */
export function assertPurchasable(
  product: PricedProduct,
  variant: PricedVariant | null,
  quantity: number,
): number {
  const price = effectivePrice(product, variant);
  if (price === null) {
    throw ApiError.badRequest(`"${product.name}" is not available to buy online right now`);
  }

  const min = product.minOrderQty || 1;
  if (quantity < min) {
    throw ApiError.badRequest(`"${product.name}" has a minimum order of ${min}`);
  }
  if (product.maxOrderQty && quantity > product.maxOrderQty) {
    throw ApiError.badRequest(`"${product.name}" is limited to ${product.maxOrderQty} per order`);
  }

  const stock = availableStock(product, variant);
  if (stock !== null && stock < quantity) {
    throw ApiError.conflict(
      stock > 0
        ? `Only ${stock} left of "${product.name}"${variant ? ` (${variant.label})` : ''}`
        : `"${product.name}"${variant ? ` (${variant.label})` : ''} is out of stock`,
    );
  }

  return quantity;
}

/**
 * Inventory movement rules, in one place so reserve/release always agree.
 *
 * - When `trackInventory` is OFF nothing moves. Not the product row, and not
 *   the variant row — an untracked product is made to order.
 * - When it is ON we move the variant row if the line names a variant, and the
 *   product row otherwise. Never both: that would double-count.
 */
export interface StockMovement {
  target: 'variant' | 'product' | 'none';
  id: string;
  delta: number;
}

export function stockMovementFor(
  product: Pick<Product, 'id' | 'trackInventory'>,
  variantId: string | null,
  quantity: number,
  direction: 'reserve' | 'release',
): StockMovement {
  if (!product.trackInventory) return { target: 'none', id: product.id, delta: 0 };

  const delta = direction === 'reserve' ? -quantity : quantity;
  if (variantId) return { target: 'variant', id: variantId, delta };
  return { target: 'product', id: product.id, delta };
}
