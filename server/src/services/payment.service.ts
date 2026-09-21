import crypto from 'crypto';
import type { PaymentEventType, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/http';
import { money } from '../utils/helpers';
import { restoreStockForOrder } from './order.service';
import {
  refundPayment,
  toPaise,
  verifyPaymentStrict,
  type RemotePayment,
} from './razorpay.service';

/** How long an unpaid Razorpay attempt stays reserved before it is swept. */
export const PAYMENT_TTL_MINUTES = 30;

/** How long an identical refund request counts as a repeat of the same one. */
export const DUPLICATE_REFUND_WINDOW_MINUTES = 15;

export function paymentExpiry(): Date {
  return new Date(Date.now() + PAYMENT_TTL_MINUTES * 60_000);
}

/**
 * Appends an event. `externalId` makes it idempotent: a replayed Razorpay
 * webhook carrying the same event id is recorded once and recognised as a
 * duplicate on every later delivery.
 *
 * Returns false when the event was already recorded.
 */
export async function recordEvent(
  paymentId: string,
  type: PaymentEventType,
  message: string,
  payload: Prisma.InputJsonValue = {},
  externalId?: string | null,
): Promise<boolean> {
  try {
    await prisma.paymentEvent.create({
      data: { paymentId, type, message, payload, externalId: externalId ?? null },
    });
    return true;
  } catch (err) {
    // P2002 on (paymentId, externalId) means we have already seen this event.
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
}

/**
 * Verifies a browser-returned payment and, only if every check passes, marks
 * the order paid. Safe to call twice: an already-paid payment short-circuits.
 */
export async function confirmPayment(params: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { payments: { orderBy: { createdAt: 'desc' } } },
  });
  if (!order) throw ApiError.notFound('Order not found');

  // The payment row must be the one we opened for THIS razorpay order.
  const payment = order.payments.find((p) => p.razorpayOrderId === params.razorpayOrderId);
  if (!payment) {
    throw ApiError.badRequest('This payment does not belong to the order');
  }

  // Idempotent: a second callback for an already-settled payment is a no-op.
  if (payment.status === 'PAID') {
    return { alreadyPaid: true, payment, order };
  }

  const result = await verifyPaymentStrict({
    razorpayOrderId: params.razorpayOrderId,
    razorpayPaymentId: params.razorpayPaymentId,
    signature: params.signature,
    expectedRazorpayOrderId: payment.razorpayOrderId,
    expectedAmount: Number(order.total),
    expectedCurrency: order.currency,
  });

  if (!result.ok) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        // A transport problem is not the customer's fault: stay PENDING and let
        // the webhook settle it. Anything else is a hard failure.
        status: result.reason === 'REMOTE_UNAVAILABLE' ? 'PENDING' : 'FAILED',
        errorCode: result.reason,
        errorDescription: result.detail,
      },
    });
    await recordEvent(
      payment.id,
      result.reason === 'SIGNATURE_MISMATCH' ? 'SIGNATURE_MISMATCH' : 'PAYMENT_FAILED',
      `${result.reason}: ${result.detail}`,
      { razorpayPaymentId: params.razorpayPaymentId } as Prisma.InputJsonValue,
    );

    if (result.reason !== 'REMOTE_UNAVAILABLE') {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'FAILED' },
      });
    }

    throw ApiError.badRequest(
      result.reason === 'REMOTE_UNAVAILABLE'
        ? 'We could not confirm your payment with Razorpay yet. If money has left your account it will be confirmed shortly — please do not pay again.'
        : 'We could not verify this payment. Please contact us before trying again.',
    );
  }

  return markPaid(payment.id, order.id, result.payment);
}

/** Applies a verified capture. Shared by the callback and the webhook. */
export async function markPaid(paymentId: string, orderId: string, remote: RemotePayment) {
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'PAID',
      razorpayPaymentId: remote.id,
      instrument: remote.method,
      bank: remote.bank,
      wallet: remote.wallet,
      vpa: remote.vpa,
      cardLast4: remote.cardLast4,
      errorCode: null,
      errorDescription: null,
      expiresAt: null,
    },
  });

  await recordEvent(paymentId, 'SIGNATURE_VERIFIED', 'All verification checks passed');
  await recordEvent(
    paymentId,
    'PAYMENT_CAPTURED',
    `Captured ${remote.amountPaise / 100} via ${remote.method ?? 'razorpay'}`,
    { razorpayPaymentId: remote.id } as Prisma.InputJsonValue,
  );

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: 'PAID', status: 'CONFIRMED', confirmedAt: new Date() },
  });

  return { alreadyPaid: false, payment, order };
}

/**
 * Records an abandoned or failed attempt.
 *
 * Secured: the caller must prove they own the order (signed-in owner, or the
 * exact email for a guest order) AND the payment must still be open. A failure
 * report can never downgrade a payment that already succeeded.
 */
export async function recordPaymentFailure(params: {
  orderId: string;
  code?: string | null;
  description?: string | null;
  razorpayPaymentId?: string | null;
  actor: { userId?: string; email?: string };
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!order) throw ApiError.notFound('Order not found');

  assertOrderAccess(order, params.actor);

  const payment = order.payments[0];
  if (!payment) throw ApiError.notFound('Payment record not found');

  // Never let a client-reported failure override a settled payment.
  if (payment.status === 'PAID' || order.paymentStatus === 'PAID') {
    return { ignored: true as const, reason: 'Payment already captured' };
  }
  if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
    return { ignored: true as const, reason: 'Payment already refunded' };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'FAILED',
      // Free-text from the browser is untrusted: clamp it.
      errorCode: (params.code ?? 'PAYMENT_FAILED').slice(0, 80),
      errorDescription: (params.description ?? 'Payment was not completed').slice(0, 500),
    },
  });
  await recordEvent(
    payment.id,
    'PAYMENT_FAILED',
    (params.description ?? 'Payment was not completed').slice(0, 500),
    { razorpayPaymentId: params.razorpayPaymentId ?? null } as Prisma.InputJsonValue,
  );

  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } });
  return { ignored: false as const };
}

/** Shared ownership check for guest and account orders. */
export function assertOrderAccess(
  order: { userId: string | null; customerEmail: string },
  actor: { userId?: string; email?: string; isAdmin?: boolean },
): void {
  if (actor.isAdmin) return;

  if (order.userId) {
    if (!actor.userId || actor.userId !== order.userId) {
      throw ApiError.forbidden('This order belongs to another account');
    }
    return;
  }

  const email = (actor.email ?? '').trim().toLowerCase();
  if (!email || email !== order.customerEmail.toLowerCase()) {
    throw ApiError.forbidden('Enter the email used on this order');
  }
}

/**
 * Refunds a captured payment.
 *
 * Idempotent on two levels: Razorpay receives an idempotency key derived from
 * the order and amount, and the resulting `razorpayRefundId` is stored behind a
 * unique constraint, so a replayed webhook or double-clicked button can never
 * double-count.
 */
export async function issueRefund(params: {
  orderId: string;
  amount?: number;
  reason?: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: {
      payments: { where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!order) throw ApiError.notFound('Order not found');

  const payment = order.payments[0];
  if (!payment) throw ApiError.badRequest('This order has no captured payment to refund');
  if (payment.method === 'COD') {
    throw ApiError.badRequest('Cash on delivery orders cannot be refunded online');
  }
  if (!payment.razorpayPaymentId) {
    throw ApiError.badRequest('No Razorpay payment id on this order');
  }

  const alreadyRefunded = Number(payment.refundedAmount);
  const captured = Number(payment.amount);
  const remaining = money(captured - alreadyRefunded);

  if (remaining <= 0) {
    throw ApiError.badRequest('This payment has already been fully refunded');
  }

  const amount = params.amount ? money(params.amount) : remaining;
  if (amount <= 0) throw ApiError.badRequest('Refund amount must be greater than zero');
  if (amount > remaining) {
    throw ApiError.badRequest(`Only ₹${remaining} remains refundable on this payment`);
  }

  const intent = `${payment.id}:${toPaise(amount)}:${(params.reason ?? '').trim().toLowerCase()}`;

  /*
   * A double-clicked button, a retried request or a re-submitted form is the
   * SAME refund, so it must not reach Razorpay a second time. The ledger is
   * checked first: an identical refund raised moments ago is reported back as
   * a duplicate. Deliberately refunding the same amount again is still
   * possible once the window has passed.
   */
  const recent = await prisma.refund.findFirst({
    where: {
      paymentId: payment.id,
      amount,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_REFUND_WINDOW_MINUTES * 60_000) },
      notes: { path: ['intent'], equals: intent },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    return { duplicate: true as const, refundId: recent.razorpayRefundId };
  }

  // Sent to Razorpay too, so the gateway de-duplicates even if we race.
  const idempotencyKey = crypto.createHash('sha256').update(intent).digest('hex').slice(0, 32);

  const refund = await refundPayment(payment.razorpayPaymentId, amount, idempotencyKey);

  return applyRefund(
    payment.id,
    order.id,
    {
      razorpayRefundId: refund.id,
      amount: refund.amountPaise / 100,
      status: refund.status,
      speed: refund.speed,
    },
    { intent, reason: params.reason ?? null },
  );
}

/**
 * Persists a refund exactly once and recomputes the payment/order status.
 * Shared by the admin action and the refund webhook.
 */
export async function applyRefund(
  paymentId: string,
  orderId: string,
  refund: { razorpayRefundId: string; amount: number; status: string; speed?: string | null },
  notes: Prisma.InputJsonValue = {},
) {
  const created = await prisma.refund
    .create({
      data: {
        paymentId,
        razorpayRefundId: refund.razorpayRefundId,
        amount: refund.amount,
        status: refund.status,
        speed: refund.speed ?? null,
        notes,
      },
    })
    .catch((err: { code?: string }) => {
      if (err.code === 'P2002') return null; // already recorded
      throw err;
    });

  if (!created) {
    return { duplicate: true as const, refundId: refund.razorpayRefundId };
  }

  // Recompute from the refund ledger rather than incrementing a counter, so the
  // total can never drift.
  const totals = await prisma.refund.aggregate({
    where: { paymentId },
    _sum: { amount: true },
  });
  const refundedTotal = money(Number(totals._sum.amount ?? 0));

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const fullyRefunded = refundedTotal >= Number(payment.amount) - 0.009;

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      refundedAmount: refundedTotal,
      status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    },
  });

  await recordEvent(
    paymentId,
    'REFUND',
    `Refunded ₹${refund.amount} (${fullyRefunded ? 'full' : 'partial'})`,
    { razorpayRefundId: refund.razorpayRefundId } as Prisma.InputJsonValue,
    `refund:${refund.razorpayRefundId}`,
  );

  // A fully refunded order is cancelled, and its stock goes back exactly once.
  if (fullyRefunded) {
    await restoreStockForOrder(orderId);
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      ...(fullyRefunded ? { status: 'REFUNDED', cancelledAt: new Date() } : {}),
    },
  });

  return { duplicate: false as const, refundedTotal, fullyRefunded, order };
}

/**
 * Sweeps Razorpay attempts that were never completed.
 *
 * An abandoned attempt holds reserved stock, so past its TTL the payment is
 * cancelled and — if nothing else on the order succeeded — the stock is released
 * and the order is cancelled. Runs on an interval and is safe to call anytime.
 */
export async function expireAbandonedPayments(now = new Date()): Promise<number> {
  const stale = await prisma.payment.findMany({
    where: {
      method: 'RAZORPAY',
      status: 'PENDING',
      expiresAt: { not: null, lt: now },
    },
    select: { id: true, orderId: true },
    take: 200,
  });

  let swept = 0;
  for (const payment of stale) {
    // Re-read the order: another attempt may have succeeded in the meantime.
    const order = await prisma.order.findUnique({
      where: { id: payment.orderId },
      include: { payments: true },
    });
    if (!order) continue;

    const settled = order.payments.some((p) =>
      ['PAID', 'AUTHORIZED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(p.status),
    );

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'CANCELLED', errorCode: 'EXPIRED', errorDescription: 'Payment attempt expired' },
    });
    await recordEvent(payment.id, 'PAYMENT_FAILED', 'Attempt expired before completion');

    if (settled || order.status === 'CANCELLED') continue;

    const stillOpen = await prisma.payment.count({
      where: { orderId: order.id, status: { in: ['PENDING', 'AUTHORIZED'] } },
    });
    if (stillOpen > 0) continue;

    // Nothing is in flight any more: release the reservation.
    await restoreStockForOrder(order.id);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', paymentStatus: 'CANCELLED', cancelledAt: new Date() },
    });
    swept += 1;
  }

  return swept;
}
