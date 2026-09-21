import slugify from 'slugify';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

export function toSlug(input: string): string {
  return slugify(input, { lower: true, strict: true, trim: true });
}

type SlugModel =
  | 'product'
  | 'category'
  | 'page'
  | 'attributeGroup';

/**
 * Generates a unique slug for a model, appending -2, -3... on collision.
 * `ignoreId` lets an update keep its own slug.
 */
export async function uniqueSlug(model: SlugModel, desired: string, ignoreId?: string): Promise<string> {
  const base = toSlug(desired) || 'item';
  let candidate = base;
  let counter = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const delegate = prisma[model] as unknown as {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
    };
    const existing = await delegate.findFirst({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === ignoreId) return candidate;
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

/** Decimal -> number, tolerating null. */
export function decToNum(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

/** Rounds to 2dp and avoids floating point drift on money. */
export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function generateOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `BW${y}${m}${d}${rand}`;
}

/** Coerces the many shapes a boolean can arrive in from multipart/query strings. */
export function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true;
    if (['0', 'false', 'no', 'off', ''].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

export function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Escapes a string for safe use inside a JSON-LD / XML document. */
export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function truncate(input: string, max = 160): string {
  const clean = stripHtml(input);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
