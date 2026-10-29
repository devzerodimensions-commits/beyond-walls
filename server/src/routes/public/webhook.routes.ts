import { Router, raw } from 'express';
import prisma from '../../lib/prisma';
import { asyncHandler } from '../../utils/http';
import { verifyWebhookSignature } from '../../services/razorpay.service';
import { applyRefund, markPaid, recordEvent } from '../../services/payment.service';
import { ORDER_INCLUDE, restoreStockForOrder } from '../../services/order.service';
import { env } from '../../config/env';
import { mapCourierStatus } from '../../services/courierStatus';
import { sendOrderStatusUpdate } from '../../services/email.service';

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

/**
 * POST /api/webhooks/parcel-tracking
 *
 * Where the courier reports a parcel moving.
 *
 * Named "parcel-tracking" deliberately. Shiprocket refuses a callback URL
 * containing shiprocket, kartrocket, sr or kr, so the obvious name for this
 * route is the one name it cannot have.
 *
 * Authenticated by a shared secret in x-api-key, which is their mechanism.
 * Without it the route refuses everything: the URL is not a secret, and anyone
 * who learned it could otherwise mark an order delivered and trigger the
 * email that goes with it.
 *
 * Always answers 200 once the secret checks out, because their documentation
 * asks for it and a retry storm helps nobody. An event about an order we
 * cannot find, or one that means nothing to us, is acknowledged and dropped.
 */
router.post(
  '/parcel-tracking',
  asyncHandler(async (req, res) => {
    if (!env.shiprocketWebhookToken) {
      return res.status(503).json({ success: false, error: { message: 'Tracking webhook not configured' } });
    }

    const presented = req.headers['x-api-key'];
    if (typeof presented !== 'string' || presented !== env.shiprocketWebhookToken) {
      return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
    }

    const body = (typeof req.body === 'object' && req.body ? req.body : {}) as Record<string, unknown>;

    /*
     * `order_id` is the reference we sent at booking, which is our own order
     * number. It is the only identifier in this payload we issued ourselves,
     * so it is the one worth trusting; the shipment id is a fallback for an
     * order booked before this field was stored.
     *
     * Their sample shows order_id as "1373900_150876814" -- their channel id
     * joined to ours -- so the tail after the last underscore is taken when
     * the whole string does not match.
     */
    const reference = String(body.order_id ?? '');
    const shipmentId = body.sr_order_id ? String(body.sr_order_id) : undefined;
    const tail = reference.includes('_') ? reference.slice(reference.lastIndexOf('_') + 1) : reference;

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: reference },
          { orderNumber: tail },
          ...(shipmentId ? [{ courierOrderId: shipmentId }] : []),
        ],
      },
    });

    if (!order) {
      return res.json({ success: true, data: { unmatched: reference } });
    }

    const awb = body.awb ? String(body.awb) : null;
    const courierName = body.courier_name ? String(body.courier_name) : null;
    const label = String(body.current_status ?? body.shipment_status ?? '');
    const nextStatus = mapCourierStatus(label);

    const data: Record<string, unknown> = {};

    // The waybill can arrive here first if it was assigned in their panel
    // rather than through the site.
    if (awb && awb !== order.trackingNumber) {
      data.trackingNumber = awb;
      data.trackingUrl = `https://shiprocket.co/tracking/${awb}`;
    }
    if (courierName && courierName !== order.courierName) data.courierName = courierName;

    /*
     * Statuses only ever move forward.
     *
     * Couriers resend and reorder events, and a late "in transit" arriving
     * after "delivered" would otherwise walk a finished order backwards and
     * email the customer about it. Cancellations are the exception — an RTO is
     * real news whenever it arrives.
     */
    const FLOW = ['PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    const moved =
      nextStatus &&
      nextStatus !== order.status &&
      (nextStatus === 'CANCELLED' || FLOW.indexOf(nextStatus) > FLOW.indexOf(order.status));

    if (moved) {
      data.status = nextStatus;
      if (nextStatus === 'SHIPPED' && !order.shippedAt) data.shippedAt = new Date();
      if (nextStatus === 'DELIVERED' && !order.deliveredAt) data.deliveredAt = new Date();
    }

    if (!Object.keys(data).length) {
      return res.json({ success: true, data: { noop: label } });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: data as never,
      include: ORDER_INCLUDE,
    });

    // Only when the status actually moved. A waybill appearing is not news to
    // a customer; "your order is out for delivery" is.
    if (moved) {
      await sendOrderStatusUpdate(updated as never, env.publicSiteUrl);
    }

    return res.json({ success: true, data: { orderNumber: order.orderNumber, status: updated.status } });
  }),
);

export default router;
export { restoreStockForOrder };
