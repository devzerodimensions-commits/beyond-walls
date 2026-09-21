import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env, razorpayConfigured } from '../config/env';
import { ApiError } from '../utils/http';

/**
 * Razorpay integration.
 *
 * Security model:
 *  - RAZORPAY_KEY_SECRET is read from the environment, used only here, and never
 *    returned by any API response. Only RAZORPAY_KEY_ID reaches the browser.
 *  - Every captured payment must satisfy ALL of:
 *      1. HMAC signature over `order_id|payment_id` matches (timing-safe)
 *      2. the razorpay_order_id matches the one WE created for that order
 *      3. Razorpay's own record of the payment is fetchable
 *      4. its status is captured/authorized
 *      5. its amount equals our order total to the paise
 *      6. its order_id matches too
 *    There is no fallback: if Razorpay cannot be reached, the payment is left
 *    pending for the webhook to reconcile. It is never optimistically marked paid.
 */

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!razorpayConfigured) {
    throw new ApiError(
      503,
      'Online payments are not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server .env file.',
      'RAZORPAY_NOT_CONFIGURED',
    );
  }
  if (!client) {
    client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  }
  return client;
}

/** Rupees -> paise, rounded, so float drift can never shift an amount. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export interface CreateRazorpayOrderInput {
  amount: number;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string | undefined;
  status: string;
}

export async function createRazorpayOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrderResult> {
  const rzp = getClient();
  const amountPaise = toPaise(input.amount);

  if (amountPaise < 100) {
    throw ApiError.badRequest('Order total must be at least ₹1 to pay online');
  }

  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: env.razorpayCurrency,
    receipt: input.receipt.slice(0, 40),
    notes: input.notes ?? {},
    payment_capture: true,
  });

  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    receipt: order.receipt,
    status: order.status,
  };
}

/** Timing-safe comparison of two hex digests. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the checkout handler signature:
 * HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
 */
export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  if (!razorpayConfigured) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');
  return safeEqual(expected, params.signature);
}

/** Verifies a webhook body against RAZORPAY_WEBHOOK_SECRET. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
  if (!env.razorpayWebhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');
  return safeEqual(expected, signature);
}

export interface RemotePayment {
  id: string;
  orderId: string | null;
  status: string;
  amountPaise: number;
  currency: string;
  method: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  cardLast4: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

/** Fetches the authoritative payment record from Razorpay. */
export async function fetchPayment(paymentId: string): Promise<RemotePayment> {
  const rzp = getClient();
  const p = (await rzp.payments.fetch(paymentId)) as unknown as Record<string, unknown>;
  const card = p.card as Record<string, unknown> | undefined;

  return {
    id: String(p.id),
    orderId: (p.order_id as string) ?? null,
    status: String(p.status ?? ''),
    amountPaise: Number(p.amount ?? 0),
    currency: String(p.currency ?? 'INR'),
    method: (p.method as string) ?? null,
    bank: (p.bank as string) ?? null,
    wallet: (p.wallet as string) ?? null,
    vpa: (p.vpa as string) ?? null,
    cardLast4: (card?.last4 as string) ?? null,
    errorCode: (p.error_code as string) ?? null,
    errorDescription: (p.error_description as string) ?? null,
  };
}

export interface VerificationInput {
  /** What the browser handed back. */
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
  /** What WE recorded when the payment was created. */
  expectedRazorpayOrderId: string | null;
  expectedAmount: number;
  expectedCurrency: string;
}

export type VerificationFailure =
  | 'NOT_CONFIGURED'
  | 'SIGNATURE_MISMATCH'
  | 'ORDER_MISMATCH'
  | 'REMOTE_UNAVAILABLE'
  | 'NOT_CAPTURED'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH';

export type VerificationResult =
  | { ok: true; payment: RemotePayment }
  | { ok: false; reason: VerificationFailure; detail: string; payment?: RemotePayment };

/**
 * The single gate every online payment must pass before an order is marked paid.
 * Every check is mandatory — there is deliberately no "close enough" path.
 */
export async function verifyPaymentStrict(input: VerificationInput): Promise<VerificationResult> {
  if (!razorpayConfigured) {
    return { ok: false, reason: 'NOT_CONFIGURED', detail: 'Razorpay keys are not configured' };
  }

  // 1. The order id the browser used must be the one we created.
  if (!input.expectedRazorpayOrderId || input.razorpayOrderId !== input.expectedRazorpayOrderId) {
    return {
      ok: false,
      reason: 'ORDER_MISMATCH',
      detail: `Payment references ${input.razorpayOrderId} but this order expects ${input.expectedRazorpayOrderId ?? 'none'}`,
    };
  }

  // 2. Signature.
  if (
    !verifyPaymentSignature({
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      signature: input.signature,
    })
  ) {
    return { ok: false, reason: 'SIGNATURE_MISMATCH', detail: 'Signature did not match' };
  }

  // 3. Razorpay's own record. No fallback — unreachable means unverified.
  let remote: RemotePayment;
  try {
    remote = await fetchPayment(input.razorpayPaymentId);
  } catch (err) {
    return {
      ok: false,
      reason: 'REMOTE_UNAVAILABLE',
      detail: err instanceof Error ? err.message : 'Could not reach Razorpay',
    };
  }

  // 4. It must belong to the same Razorpay order.
  if (remote.orderId && remote.orderId !== input.expectedRazorpayOrderId) {
    return {
      ok: false,
      reason: 'ORDER_MISMATCH',
      detail: `Razorpay reports order ${remote.orderId}`,
      payment: remote,
    };
  }

  // 5. It must actually be money in hand.
  if (!['captured', 'authorized'].includes(remote.status)) {
    return {
      ok: false,
      reason: 'NOT_CAPTURED',
      detail: `Razorpay reports status "${remote.status}"`,
      payment: remote,
    };
  }

  // 6. Exact amount, compared in paise so there is no rounding tolerance.
  const expectedPaise = toPaise(input.expectedAmount);
  if (remote.amountPaise !== expectedPaise) {
    return {
      ok: false,
      reason: 'AMOUNT_MISMATCH',
      detail: `Razorpay captured ${remote.amountPaise} paise, order expects ${expectedPaise}`,
      payment: remote,
    };
  }

  if (remote.currency !== input.expectedCurrency) {
    return {
      ok: false,
      reason: 'CURRENCY_MISMATCH',
      detail: `Razorpay used ${remote.currency}, order is ${input.expectedCurrency}`,
      payment: remote,
    };
  }

  return { ok: true, payment: remote };
}

export interface RefundResult {
  id: string;
  amountPaise: number;
  status: string;
  speed: string | null;
}

/**
 * Issues a refund. `idempotencyKey` is passed to Razorpay so a retried request
 * returns the SAME refund rather than creating a second one.
 */
export async function refundPayment(
  paymentId: string,
  amountRupees: number | undefined,
  idempotencyKey: string,
): Promise<RefundResult> {
  const rzp = getClient();
  const refund = (await rzp.payments.refund(paymentId, {
    ...(amountRupees ? { amount: toPaise(amountRupees) } : {}),
    speed: 'normal',
    notes: { idempotencyKey },
  } as never)) as unknown as Record<string, unknown>;

  return {
    id: String(refund.id),
    amountPaise: Number(refund.amount ?? 0),
    status: String(refund.status ?? 'processed'),
    speed: (refund.speed_processed as string) ?? null,
  };
}

/** Maps a Razorpay payment object onto our Payment columns. */
export function mapInstrumentDetails(payment: Record<string, unknown>) {
  const card = payment.card as Record<string, unknown> | undefined;
  return {
    instrument: (payment.method as string) ?? null,
    bank: (payment.bank as string) ?? null,
    wallet: (payment.wallet as string) ?? null,
    vpa: (payment.vpa as string) ?? null,
    cardLast4: (card?.last4 as string) ?? null,
  };
}

export { razorpayConfigured };
