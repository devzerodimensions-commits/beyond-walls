import { Router, raw } from 'express';
import prisma from '../../lib/prisma';
import { asyncHandler } from '../../utils/http';
import { verifyWebhookSignature } from '../../services/razorpay.service';
import { applyRefund, markPaid, recordEvent } from '../../services/payment.service';
import { restoreStockForOrder } from '../../services/order.service';
import { env } from '../../config/env';

const router = Router();

/**
 * POST /api/webhooks/razorpay
 *
 * Mounted with a raw body parser so the HMAC is computed over the exact bytes
 * Razorpay signed.
 *
 * Idempotency: Razorpay retries deliveries, so every event is recorded against
 * `x-razorpay-event-id`. A redelivery hits the unique (paymentId, externalId)
 * constraint, is recognised as a duplicate and skipped — a replayed
 * `refund.processed` can never refund twice.
 *
 * Always answers 200 once the signature is valid, so Razorpay stops retrying.
 */
router.post(
  '/razorpay',
  raw({ type: '*/*' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const eventId = (req.headers['x-razorpay-event-id'] as string | undefined) ?? null;
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''));

    if (!env.razorpayWebhookSecret) {
      return res.status(503).json({ success: false, error: { message: 'Webhook secret not configured' } });
    }
    if (!signature || !verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid webhook signature' } });
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, error: { message: 'Malformed webhook body' } });
    }

    const eventType = String(event.event ?? '');
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const paymentEntity = ((payload.payment as Record<string, unknown> | undefined)?.entity ?? {}) as Record<
      string,
      unknown
    >;
    const razorpayOrderId = paymentEntity.order_id as string | undefined;
    const razorpayPaymentId = paymentEntity.id as string | undefined;

    if (!razorpayOrderId) {
      return res.json({ success: true, data: { ignored: eventType } });
    }

    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId },
      orderBy: { createdAt: 'desc' },
      include: { order: true },
    });
    if (!payment) {
      return res.json({ success: true, data: { unmatched: razorpayOrderId } });
    }

    // The dedup gate. A redelivered event is logged once and never re-applied.
    const isNew = await recordEvent(
      payment.id,
      'WEBHOOK',
      eventType,
      event as never,
      eventId ? `${eventType}:${eventId}` : null,
    );
    if (!isNew) {
      return res.json({ success: true, data: { duplicate: true, event: eventType } });
    }

    const amountPaise = Number(paymentEntity.amount ?? 0);
    const expectedPaise = Math.round(Number(payment.amount) * 100);

    switch (eventType) {
      case 'payment.captured': {
        if (payment.status === 'PAID') break;

        // The webhook is trusted only after the same amount check the callback does.
        if (amountPaise !== expectedPaise) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              errorCode: 'AMOUNT_MISMATCH',
              errorDescription: `Webhook reported ${amountPaise} paise, order expects ${expectedPaise}`,
            },
          });
          await prisma.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: 'FAILED' },
          });
          break;
        }

        const card = paymentEntity.card as Record<string, unknown> | undefined;
        await markPaid(payment.id, payment.orderId, {
          id: razorpayPaymentId ?? payment.razorpayPaymentId ?? '',
          orderId: razorpayOrderId,
          status: 'captured',
          amountPaise,
          currency: String(paymentEntity.currency ?? payment.currency),
          method: (paymentEntity.method as string) ?? null,
          bank: (paymentEntity.bank as string) ?? null,
          wallet: (paymentEntity.wallet as string) ?? null,
          vpa: (paymentEntity.vpa as string) ?? null,
          cardLast4: (card?.last4 as string) ?? null,
          errorCode: null,
          errorDescription: null,
        });
        break;
      }

      case 'payment.authorized': {
        if (payment.status !== 'PAID') {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'AUTHORIZED',
              razorpayPaymentId: razorpayPaymentId ?? undefined,
              instrument: (paymentEntity.method as string) ?? null,
            },
          });
          await prisma.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: 'AUTHORIZED' },
          });
        }
        break;
      }

      case 'payment.failed': {
        // Never downgrade a settled payment on a late failure event.
        if (!['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              errorCode: (paymentEntity.error_code as string) ?? 'PAYMENT_FAILED',
              errorDescription: (paymentEntity.error_description as string) ?? 'Payment failed',
            },
          });
          await prisma.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: 'FAILED' },
          });
        }
        break;
      }

      case 'refund.created':
      case 'refund.processed': {
        const refundEntity = ((payload.refund as Record<string, unknown> | undefined)?.entity ?? {}) as Record<
          string,
          unknown
        >;
        const refundId = refundEntity.id as string | undefined;
        if (!refundId) break;

        // applyRefund is itself idempotent on razorpayRefundId, so this is safe
        // even if the event id changes between redeliveries.
        await applyRefund(payment.id, payment.orderId, {
          razorpayRefundId: refundId,
          amount: Number(refundEntity.amount ?? 0) / 100,
          status: String(refundEntity.status ?? 'processed'),
          speed: (refundEntity.speed_processed as string) ?? null,
        });
        break;
      }

      case 'order.paid':
        break;

      case 'payment.dispute.created': {
        await prisma.order.update({
          where: { id: payment.orderId },
          data: { adminNote: 'A dispute was raised on this payment. Check the Razorpay dashboard.' },
        });
        break;
      }

      default:
        break;
    }

    return res.json({ success: true, data: { processed: eventType } });
  }),
);

export default router;
export { restoreStockForOrder };
