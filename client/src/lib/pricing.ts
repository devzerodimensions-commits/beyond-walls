import type { PersonalizationField, Product, ProductVariant } from './types';
import { toNumber } from './format';

/**
 * Client-side mirror of the server's pricing rules (server/src/services/pricing.service.ts).
 *
 * Every catalogue product is direct-purchase, so "can I buy this" reduces to
 * "does a price resolve" — from the product itself, or from the chosen variant.
 * The server re-derives all of this on every request; this copy exists purely so
 * the UI can render the right state without a round trip.
 */

export function sellableVariants(variants: ProductVariant[] | undefined): ProductVariant[] {
  return (variants ?? []).filter((v) => v.status !== 'DRAFT' && v.status !== 'ARCHIVED');
}

/** Variant price wins over the product's own price. */
export function effectivePrice(
  product: Pick<Product, 'price'>,
  variant?: Pick<ProductVariant, 'price'> | null,
): number | null {
  const variantPrice = toNumber(variant?.price ?? null);
  if (variantPrice !== null) return variantPrice;
  return toNumber(product.price);
}

export interface PriceRange {
  min: number | null;
  max: number | null;
  varies: boolean;
}

/** The price (or range) a card should show. */
export function displayPriceRange(product: Product): PriceRange {
  const published = sellableVariants(product.variants);

  if (!published.length) {
    const base = toNumber(product.price);
    return { min: base, max: base, varies: false };
  }

  const prices = published
    .map((v) => effectivePrice(product, v))
    .filter((p): p is number => p !== null);

  if (!prices.length) return { min: null, max: null, varies: false };

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, varies: min !== max };
}

/** True when at least one purchase path has a price. */
export function isSellable(product: Product): boolean {
  return displayPriceRange(product).min !== null;
}

/**
 * Stock for a product/variant pair.
 * `null` means inventory is not tracked — the item is made to order.
 */
export function availableStock(
  product: Pick<Product, 'trackInventory' | 'stock'>,
  variant?: Pick<ProductVariant, 'stock'> | null,
): number | null {
  if (!product.trackInventory) return null;
  return variant ? variant.stock : product.stock;
}

export interface StockState {
  stock: number | null;
  outOfStock: boolean;
  lowStock: boolean;
}

export function stockState(
  product: Pick<Product, 'trackInventory' | 'stock'>,
  variant?: Pick<ProductVariant, 'stock'> | null,
  lowThreshold = 5,
): StockState {
  const stock = availableStock(product, variant);
  return {
    stock,
    outOfStock: stock !== null && stock <= 0,
    lowStock: stock !== null && stock > 0 && stock <= lowThreshold,
  };
}

/**
 * A product is "out of stock" on a listing only when EVERY way to buy it is out.
 * With variants, one sold-out size must not grey out the whole card.
 */
export function isFullyOutOfStock(product: Product): boolean {
  if (!product.trackInventory) return false;

  const published = sellableVariants(product.variants);
  if (!published.length) return product.stock <= 0;
  return published.every((v) => v.stock <= 0);
}

/** Personalisation fields the customer must fill in before buying. */
export function requiredPersonalizationFields(
  fields: PersonalizationField[] | undefined,
): PersonalizationField[] {
  return (fields ?? []).filter((f) => f.required && f.status === 'PUBLISHED');
}

export interface CardAction {
  /** What the button should do. */
  kind: 'add' | 'choose' | 'unavailable' | 'out-of-stock';
  label: string;
  disabled: boolean;
}

/**
 * Decides what a product card's call-to-action should be.
 *
 * A product needing a variant choice or required personalisation cannot be
 * quick-added — the card sends the customer to the product page instead of
 * silently guessing on their behalf.
 */
export function cardAction(product: Product): CardAction {
  if (!isSellable(product)) {
    return { kind: 'unavailable', label: 'View product', disabled: false };
  }
  if (isFullyOutOfStock(product)) {
    return { kind: 'out-of-stock', label: 'Out of stock', disabled: true };
  }

  const needsVariant = sellableVariants(product.variants).length > 1;
  const needsDetails = requiredPersonalizationFields(product.personalization).length > 0;

  if (needsVariant || needsDetails) {
    return { kind: 'choose', label: needsVariant ? 'Choose options' : 'Personalise', disabled: false };
  }
  return { kind: 'add', label: 'Add to cart', disabled: false };
}
