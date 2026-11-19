import type { OrderStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/http';

/**
 * Reviews written by customers rather than typed in by the studio.
 *
 * A rating on a shop page is read as a promise from other buyers, and it
 * feeds the stars Google shows next to the site. That makes it the one piece
 * of content on here that must not be writable by whoever happens to find the
 * form, so the rules are deliberately narrow and all of them are enforced on
 * the server, where a determined visitor cannot reach them.
 *
 * To write one you must be signed in, and the account must have bought the
 * product and received it. Delivery rather than payment is the line because
 * "verified purchase" means nothing if it can be claimed before the piece has
 * been seen -- these are made to order, and the thing being judged does not
 * exist until it arrives.
 *
 * A guest order counts. People buy without an account and make one later, so
 * orders are matched by account id OR by the email the order was placed
 * under; the second is what stops an honest customer being told they never
 * bought the thing they are holding.
 *
 * Nothing written here is ever published by writing it. Every review arrives
 * hidden and waits for the studio, which is the only safe default for content
 * that speaks in a customer's voice on the shop's behalf.
 */

/** Statuses that mean the piece is in the customer's hands. */
const RECEIVED: OrderStatus[] = ['DELIVERED'];

export interface ReviewEligibility {
  allowed: boolean;
  /** Why not, in words the shop can show as they are. */
  reason: string;
  /** True once this account has already written about this product. */
  alreadyReviewed: boolean;
}

/**
 * May this account write about this product?
 *
 * Returns rather than throws: the product page asks this to decide what to
 * show, and "no, and here is why" is the useful answer in every case.
 */
export async function reviewEligibility(
  productId: string,
  userId: string | undefined,
): Promise<ReviewEligibility> {
  if (!userId) {
    return {
      allowed: false,
      alreadyReviewed: false,
      reason: 'Sign in to write a review.',
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) {
    return { allowed: false, alreadyReviewed: false, reason: 'Sign in to write a review.' };
  }

  const existing = await prisma.review.findFirst({
    where: { productId, userId },
    select: { id: true },
  });
  if (existing) {
    return {
      allowed: false,
      alreadyReviewed: true,
      reason: 'You have already reviewed this product.',
    };
  }

  /*
   * Matched on the account OR the email the order was placed under, so an
   * order placed as a guest before the account existed still counts.
   */
  const delivered = await prisma.order.findFirst({
    where: {
      status: { in: [...RECEIVED] },
      OR: [{ userId: user.id }, { customerEmail: user.email }],
      items: { some: { productId } },
    },
    select: { id: true },
  });

  if (!delivered) {
    return {
      allowed: false,
      alreadyReviewed: false,
      reason: 'Only customers who have received this piece can review it.',
    };
  }

  return { allowed: true, alreadyReviewed: false, reason: '' };
}

export interface SubmittedReview {
  rating: unknown;
  title?: unknown;
  content?: unknown;
}

const MIN_CONTENT = 10;
const MAX_CONTENT = 2000;
const MAX_TITLE = 120;

/**
 * Records a customer's review, hidden, for the studio to look at.
 *
 * The author's name is taken from their account rather than from the form:
 * a name that arrives in the request body is a name anyone can choose, and
 * "Beyond Walls" is one of the things they could choose it to be.
 */
export async function submitReview(
  productId: string,
  userId: string,
  body: SubmittedReview,
) {
  const eligibility = await reviewEligibility(productId, userId);
  if (!eligibility.allowed) throw ApiError.forbidden(eligibility.reason);

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw ApiError.unprocessable('Choose a rating between 1 and 5 stars', { field: 'rating' });
  }

  const content = String(body.content ?? '').trim();
  if (content.length < MIN_CONTENT) {
    throw ApiError.unprocessable(
      `Tell us a little more — at least ${MIN_CONTENT} characters`,
      { field: 'content' },
    );
  }
  if (content.length > MAX_CONTENT) {
    throw ApiError.unprocessable(`Keep it under ${MAX_CONTENT} characters`, { field: 'content' });
  }

  const title = String(body.title ?? '').trim().slice(0, MAX_TITLE);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  return prisma.review.create({
    data: {
      productId,
      userId,
      authorName: user?.name?.trim() || user?.email?.split('@')[0] || 'Customer',
      rating,
      title: title || null,
      content,
      // Never published by the act of writing it. The studio decides.
      status: 'DRAFT',
    },
    select: { id: true },
  });
}
