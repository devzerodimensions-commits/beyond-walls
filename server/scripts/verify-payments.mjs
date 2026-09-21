/**
 * Razorpay TEST MODE verification.
 *
 * Run with the sandbox stack (see scripts/run-payment-tests.ps1):
 *   1. node scripts/razorpay-sandbox-server.mjs 4999
 *   2. API started with RAZORPAY_SANDBOX_URL + test keys and
 *      NODE_OPTIONS="--require ./scripts/razorpay-sandbox.cjs"
 *   3. node scripts/verify-payments.mjs
 *
 * The server runs its real verification code — real HMACs, real state machine,
 * real database. Only Razorpay's HTTP endpoint is substituted, so success,
 * failure, retry, duplicate webhook and refund can all be exercised without
 * live gateway keys.
 */

import crypto from 'crypto';

const BASE = process.env.API_URL ?? 'http://localhost:4000/api';
const SANDBOX = process.env.RAZORPAY_SANDBOX_URL ?? 'http://127.0.0.1:4999';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? 'sandbox_secret';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? 'sandbox_webhook_secret';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@beyondwall.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

let passed = 0;
let failed = 0;
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ${c.green('PASS')}  ${label}`); }
  else { failed += 1; console.log(`  ${c.red('FAIL')}  ${label}${detail ? c.dim(` — ${detail}`) : ''}`); }
}
const section = (t) => console.log(`\n${c.bold(t)}`);

const jar = new Map();
function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

let cartSession = `pay_${Date.now().toString(36)}`;

async function call(path, { method = 'GET', body, token, headersExtra } = {}) {
  const headers = { Accept: 'application/json', 'x-cart-session': cartSession, ...headersExtra };
  if (body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  storeCookies(res);
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: json?.data, error: json?.error, message: json?.message };
}

const sandbox = (path, body) =>
  fetch(`${SANDBOX}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => r.json());

/** The signature Razorpay Checkout hands the browser after a successful pay. */
const handlerSignature = (orderId, paymentId) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const webhookSignature = (raw) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

let adminToken = null;
let productId = null;
const ADDRESS = {
  fullName: 'Pay Tester', phone: '9876543210',
  line1: 'Prime Center Mall', city: 'Ahmedabad',
  state: 'Gujarat', pincode: '380001', country: 'India',
};

/** Places a fresh RAZORPAY order and returns { orderId, rzpOrderId, total }. */
async function placeOnlineOrder(email = 'pay.tester@example.com') {
  cartSession = `pay_${crypto.randomBytes(6).toString('hex')}`;
  const add = await call('/cart/items', { method: 'POST', body: { productId, quantity: 1 } });
  if (add.status !== 201) throw new Error(`cart add failed: ${JSON.stringify(add.error)}`);

  const order = await call('/orders', {
    method: 'POST',
    body: {
      customerName: 'Pay Tester',
      customerEmail: email,
      customerPhone: '9876543210',
      shippingAddress: ADDRESS,
      billingSameAsShipping: true,
      paymentMethod: 'RAZORPAY',
    },
  });
  if (order.status !== 201) throw new Error(`order failed: ${JSON.stringify(order.error)}`);
  return {
    orderId: order.data.order.id,
    orderNumber: order.data.order.orderNumber,
    rzpOrderId: order.data.razorpay.orderId,
    amountPaise: order.data.razorpay.amount,
    total: Number(order.data.order.total),
  };
}

/** Stages a payment in the sandbox and returns its id. */
async function stagePayment({ rzpOrderId, amountPaise, status = 'captured', currency = 'INR' }) {
  const p = await sandbox('/_control/payment', {
    order_id: rzpOrderId, amount: amountPaise, status, currency,
  });
  return p.id;
}

async function sendWebhook(event, { eventId } = {}) {
  const raw = JSON.stringify(event);
  return call('/webhooks/razorpay', {
    method: 'POST',
    body: raw,
    headersExtra: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': webhookSignature(raw),
      ...(eventId ? { 'x-razorpay-event-id': eventId } : {}),
    },
  });
}

const capturedEvent = (rzpOrderId, paymentId, amountPaise) => ({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: paymentId, order_id: rzpOrderId, amount: amountPaise,
        currency: 'INR', status: 'captured', method: 'upi', vpa: 'test@razorpay',
      },
    },
  },
});

async function main() {
  console.log(c.bold('\nBeyond Walls — Razorpay TEST MODE verification'));
  console.log(c.dim(`API: ${BASE}   sandbox: ${SANDBOX}\n`));

  // ------------------------------------------------------------------ setup
  section('Setup');
  {
    const probe = await fetch(`${SANDBOX}/_control/state`).then((r) => r.ok).catch(() => false);
    if (!probe) {
      console.log(c.red('  The sandbox gateway is not running. Start razorpay-sandbox-server.mjs first.'));
      process.exit(1);
    }
    await sandbox('/_control/reset', {});

    const login = await call('/auth/login', {
      method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    adminToken = login.data?.accessToken;
    check('Admin signed in', Boolean(adminToken));

    await call('/admin/settings', {
      method: 'PUT', token: adminToken,
      body: { values: { 'payment.razorpayEnabled': true, 'payment.codEnabled': true } },
    });

    const product = await call('/admin/products', {
      method: 'POST', token: adminToken,
      body: {
        name: `Payment Test Item ${Date.now()}`,
        price: 1200, trackInventory: true, stock: 50, status: 'DRAFT',
      },
    });
    productId = product.data?.id;
    await call(`/admin/products/${productId}/status`, {
      method: 'PATCH', token: adminToken, body: { status: 'PUBLISHED' },
    });
    check('Test product published', Boolean(productId));

    const first = await placeOnlineOrder();
    check('Razorpay order created through the gateway', first.rzpOrderId?.startsWith('order_'),
      first.rzpOrderId);
    check('Gateway amount equals the order total in paise',
      first.amountPaise === Math.round(first.total * 100),
      `${first.amountPaise} vs ${Math.round(first.total * 100)}`);

    const detail = await call(`/orders/${first.orderId}?email=pay.tester@example.com`);
    const payment = detail.data?.payments?.[0];
    check('Pending attempt carries an expiry (abandoned-payment sweep)',
      Boolean(payment?.expiresAt) &&
        new Date(payment.expiresAt).getTime() > Date.now() + 25 * 60_000);
    check('Secret key never appears in the checkout response',
      !JSON.stringify(detail.data ?? {}).includes(KEY_SECRET));
  }

  // ---------------------------------------------------------------- success
  section('Success path');
  let paidOrder = null;
  {
    paidOrder = await placeOnlineOrder();
    const paymentId = await stagePayment(paidOrder);

    const verify = await call('/payments/verify', {
      method: 'POST',
      body: {
        orderId: paidOrder.orderId,
        razorpayOrderId: paidOrder.rzpOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: handlerSignature(paidOrder.rzpOrderId, paymentId),
      },
    });
    check('Valid capture verifies', verify.ok, JSON.stringify(verify.error));
    check('Order marked PAID', verify.data?.order?.paymentStatus === 'PAID',
      verify.data?.order?.paymentStatus);
    check('Order confirmed', verify.data?.order?.status === 'CONFIRMED');
    check('Payment id stored', verify.data?.order?.payments?.[0]?.razorpayPaymentId === paymentId);

    // Replay of the same callback.
    const again = await call('/payments/verify', {
      method: 'POST',
      body: {
        orderId: paidOrder.orderId,
        razorpayOrderId: paidOrder.rzpOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: handlerSignature(paidOrder.rzpOrderId, paymentId),
      },
    });
    check('Replayed callback is idempotent', again.ok && again.data?.alreadyPaid === true);
    check('Still exactly one payment row', (again.data?.order?.payments ?? []).length === 1);
  }

  // ------------------------------------------------------- rejection checks
  section('Verification gate — every check is mandatory');
  {
    // 1. Tampered signature.
    const o1 = await placeOnlineOrder();
    const p1 = await stagePayment(o1);
    const bad = await call('/payments/verify', {
      method: 'POST',
      body: {
        orderId: o1.orderId, razorpayOrderId: o1.rzpOrderId, razorpayPaymentId: p1,
        razorpaySignature: 'f'.repeat(64),
      },
    });
    check('Tampered signature rejected', bad.status === 400, `got ${bad.status}`);
    const o1state = await call(`/orders/${o1.orderId}?email=pay.tester@example.com`);
    check('…and the order is marked FAILED, never paid',
      o1state.data?.paymentStatus === 'FAILED', o1state.data?.paymentStatus);

    // 2. Amount tampering — signature valid, money wrong.
    const o2 = await placeOnlineOrder();
    const p2 = await stagePayment({ ...o2, amountPaise: 100 });
    const amount = await call('/payments/verify', {
      method: 'POST',
      body: {
        orderId: o2.orderId, razorpayOrderId: o2.rzpOrderId, razorpayPaymentId: p2,
        razorpaySignature: handlerSignature(o2.rzpOrderId, p2),
      },
    });
    check('Underpayment rejected (₹1 for a ₹1,200 order)', amount.status === 400);
    const o2state = await call(`/orders/${o2.orderId}?email=pay.tester@example.com`);
    check('…recorded as AMOUNT_MISMATCH',
      o2state.data?.payments?.[0]?.errorCode === 'AMOUNT_MISMATCH',
      o2state.data?.payments?.[0]?.errorCode);

    // 3. Not actually captured.
    const o3 = await placeOnlineOrder();
    const p3 = await stagePayment({ ...o3, status: 'created' });
    const notCaptured = await call('/payments/verify', {
      method: 'POST',
      body: {
        orderId: o3.orderId, razorpayOrderId: o3.rzpOrderId, razorpayPaymentId: p3,
        razorpaySignature: handlerSignature(o3.rzpOrderId, p3),
      },
    });
    check('Uncaptured payment rejected', notCaptured.status === 400);
    const o3state = await call(`/orders/${o3.orderId}?email=pay.tester@example.com`);
    check('…recorded as NOT_CAPTURED',
      o3state.data?.payments?.[0]?.errorCode === 'NOT_CAPTURED',
      o3state.data?.payments?.[0]?.errorCode);

    // 4. A payment that belongs to somebody else's Razorpay order.
    const o4 = await placeOnlineOrder();
    const foreign = await call('/payments/verify', {
      method: 'POST',
      body: {
        orderId: o4.orderId,
        razorpayOrderId: paidOrder.rzpOrderId, // another order's gateway id
        razorpayPaymentId: 'pay_whatever',
        razorpaySignature: handlerSignature(paidOrder.rzpOrderId, 'pay_whatever'),
      },
    });
    check('Payment from another order rejected', foreign.status === 400, `got ${foreign.status}`);

    // 5. Gateway unreachable must NOT optimistically pass — and must NOT fail hard.
    const o5 = await placeOnlineOrder();
    const p5 = await stagePayment(o5);
    await sandbox('/_control/outage', { count: 1 });
    const outage = await call('/payments/verify', {
      method: 'POST',
      body: {
        orderId: o5.orderId, razorpayOrderId: o5.rzpOrderId, razorpayPaymentId: p5,
        razorpaySignature: handlerSignature(o5.rzpOrderId, p5),
      },
    });
    check('Unreachable gateway does not mark the order paid', outage.status === 400);
    const o5state = await call(`/orders/${o5.orderId}?email=pay.tester@example.com`);
    check('…payment stays PENDING for the webhook to settle',
      o5state.data?.payments?.[0]?.status === 'PENDING',
      o5state.data?.payments?.[0]?.status);

    // The webhook then settles it, which is the whole point of staying pending.
    const settle = await sendWebhook(
      capturedEvent(o5.rzpOrderId, p5, o5.amountPaise),
      { eventId: `evt_settle_${Date.now()}` },
    );
    check('Webhook settles the payment the callback could not confirm', settle.ok);
    const o5after = await call(`/orders/${o5.orderId}?email=pay.tester@example.com`);
    check('…order is now PAID', o5after.data?.paymentStatus === 'PAID',
      o5after.data?.paymentStatus);
  }

  // --------------------------------------------------- payment-failed guard
  section('payments/failed — ownership and no downgrades');
  {
    const o = await placeOnlineOrder('owner.failed@example.com');

    const stranger = await call('/payments/failed', {
      method: 'POST',
      body: { orderId: o.orderId, email: 'attacker@example.com', code: 'BAD', description: 'x' },
    });
    check('Someone else cannot mark an order failed', stranger.status === 403,
      `got ${stranger.status}`);

    const anon = await call('/payments/failed', {
      method: 'POST', body: { orderId: o.orderId, code: 'BAD' },
    });
    check('Anonymous caller without the order email rejected', anon.status === 403);

    const owner = await call('/payments/failed', {
      method: 'POST',
      body: {
        orderId: o.orderId, email: 'owner.failed@example.com',
        code: 'BAD_REQUEST_ERROR', description: 'Payment cancelled by user',
      },
    });
    check('Owner can record the failure', owner.ok, JSON.stringify(owner.error));
    const state = await call(`/orders/${o.orderId}?email=owner.failed@example.com`);
    check('…order marked FAILED', state.data?.paymentStatus === 'FAILED');

    // A late failure report for an order that actually succeeded.
    const late = await call('/payments/failed', {
      method: 'POST',
      body: { orderId: paidOrder.orderId, email: 'pay.tester@example.com', code: 'LATE' },
    });
    const paidState = await call(`/orders/${paidOrder.orderId}?email=pay.tester@example.com`);
    check('A paid order is never downgraded by a failure report',
      paidState.data?.paymentStatus === 'PAID',
      `status=${paidState.data?.paymentStatus} response=${JSON.stringify(late.data)}`);
  }

  // ------------------------------------------------------------------ retry
  section('Retry after a failed attempt');
  {
    const o = await placeOnlineOrder('retry.user@example.com');
    await call('/payments/failed', {
      method: 'POST',
      body: { orderId: o.orderId, email: 'retry.user@example.com', code: 'BAD_REQUEST_ERROR' },
    });

    const wrongUser = await call(`/payments/retry/${o.orderId}`, {
      method: 'POST', body: { email: 'someone.else@example.com' },
    });
    check('Retry refuses a caller who does not own the order', wrongUser.status === 403);

    const retry = await call(`/payments/retry/${o.orderId}`, {
      method: 'POST', body: { email: 'retry.user@example.com' },
    });
    check('Retry issues a new Razorpay order', retry.ok && retry.data?.razorpay?.orderId,
      JSON.stringify(retry.error));
    const newRzpId = retry.data?.razorpay?.orderId;
    check('…with a different gateway order id', newRzpId !== o.rzpOrderId);

    const state = await call(`/orders/${o.orderId}?email=retry.user@example.com`);
    const superseded = (state.data?.payments ?? []).find((p) => p.razorpayOrderId === o.rzpOrderId);
    check('…and the old attempt is superseded, not left live',
      ['CANCELLED', 'FAILED'].includes(superseded?.status), superseded?.status);

    // The retry then succeeds.
    const p = await stagePayment({ rzpOrderId: newRzpId, amountPaise: o.amountPaise });
    const verify = await call('/payments/verify', {
      method: 'POST',
      body: {
        orderId: o.orderId, razorpayOrderId: newRzpId, razorpayPaymentId: p,
        razorpaySignature: handlerSignature(newRzpId, p),
      },
    });
    check('Retried payment verifies', verify.ok, JSON.stringify(verify.error));
    check('…order recovers to PAID', verify.data?.order?.paymentStatus === 'PAID');

    const rzpState = await call(`/orders/${o.orderId}?email=retry.user@example.com`);
    const paidRows = (rzpState.data?.payments ?? []).filter((x) => x.status === 'PAID');
    check('Exactly one payment settles', paidRows.length === 1, `${paidRows.length} paid rows`);
  }

  // --------------------------------------------------------------- webhooks
  section('Webhooks — signature, dedup, no downgrades');
  let webhookOrder = null;
  {
    const unsigned = await call('/webhooks/razorpay', {
      method: 'POST',
      body: JSON.stringify({ event: 'payment.captured' }),
      headersExtra: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'nope' },
    });
    check('Unsigned webhook rejected', unsigned.status === 400);

    webhookOrder = await placeOnlineOrder('webhook.user@example.com');
    const paymentId = await stagePayment(webhookOrder);
    const event = capturedEvent(webhookOrder.rzpOrderId, paymentId, webhookOrder.amountPaise);
    const eventId = `evt_dup_${Date.now()}`;

    const first = await sendWebhook(event, { eventId });
    check('Signed payment.captured is processed', first.ok && first.data?.processed === 'payment.captured',
      JSON.stringify(first.data));
    const afterFirst = await call(`/orders/${webhookOrder.orderId}?email=webhook.user@example.com`);
    check('…order paid by webhook alone', afterFirst.data?.paymentStatus === 'PAID');
    const paidAtFirst = afterFirst.data?.paidAt;

    const replay = await sendWebhook(event, { eventId });
    check('Redelivery recognised as a duplicate', replay.ok && replay.data?.duplicate === true,
      JSON.stringify(replay.data));
    const afterReplay = await call(`/orders/${webhookOrder.orderId}?email=webhook.user@example.com`);
    check('…and changes nothing', afterReplay.data?.paidAt === paidAtFirst);

    // A late payment.failed for an order that is already paid.
    const lateFail = await sendWebhook(
      {
        event: 'payment.failed',
        payload: { payment: { entity: { id: paymentId, order_id: webhookOrder.rzpOrderId, amount: webhookOrder.amountPaise, error_code: 'LATE' } } },
      },
      { eventId: `evt_latefail_${Date.now()}` },
    );
    const afterLate = await call(`/orders/${webhookOrder.orderId}?email=webhook.user@example.com`);
    check('A late payment.failed cannot unpay a paid order',
      lateFail.ok && afterLate.data?.paymentStatus === 'PAID',
      afterLate.data?.paymentStatus);

    // A webhook claiming the wrong amount.
    const o = await placeOnlineOrder('amount.webhook@example.com');
    const wrong = await sendWebhook(
      capturedEvent(o.rzpOrderId, 'pay_wrongamount', 100),
      { eventId: `evt_wrong_${Date.now()}` },
    );
    const wrongState = await call(`/orders/${o.orderId}?email=amount.webhook@example.com`);
    check('Webhook with a mismatched amount does not pay the order',
      wrong.ok && wrongState.data?.paymentStatus === 'FAILED',
      wrongState.data?.paymentStatus);
  }

  // ---------------------------------------------------------------- refunds
  section('Refunds — idempotent, consistent with cancellation');
  {
    const orderId = webhookOrder.orderId;

    const partial = await call(`/admin/orders/${orderId}/refund`, {
      method: 'POST', token: adminToken, body: { amount: 200, reason: 'Partial goodwill refund' },
    });
    check('Partial refund succeeds', partial.ok, JSON.stringify(partial.error));
    check('…order becomes PARTIALLY_REFUNDED',
      partial.data?.paymentStatus === 'PARTIALLY_REFUNDED', partial.data?.paymentStatus);
    check('…refunded amount recorded exactly',
      Number(partial.data?.payments?.[0]?.refundedAmount) === 200,
      String(partial.data?.payments?.[0]?.refundedAmount));

    // The double-clicked button.
    const duplicate = await call(`/admin/orders/${orderId}/refund`, {
      method: 'POST', token: adminToken, body: { amount: 200, reason: 'Partial goodwill refund' },
    });
    check('Repeating the same refund is recognised, not re-charged',
      duplicate.ok && Number(duplicate.data?.payments?.[0]?.refundedAmount) === 200,
      `refunded=${duplicate.data?.payments?.[0]?.refundedAmount}`);

    const gateway = await sandbox('/_control/state');
    const forThisPayment = gateway.refunds.filter(
      (r) => r.payment_id === duplicate.data?.payments?.[0]?.razorpayPaymentId,
    );
    check('…and the gateway shows exactly one refund', forThisPayment.length === 1,
      `${forThisPayment.length} refunds at the gateway`);

    // Refunding the rest settles the order.
    const rest = await call(`/admin/orders/${orderId}/refund`, {
      method: 'POST', token: adminToken, body: { reason: 'Balance refunded' },
    });
    check('Remaining balance can be refunded', rest.ok, JSON.stringify(rest.error));
    check('…order becomes REFUNDED', rest.data?.paymentStatus === 'REFUNDED',
      rest.data?.paymentStatus);
    check('…total refunded equals the order total',
      Number(rest.data?.payments?.[0]?.refundedAmount) === Number(rest.data?.total),
      `${rest.data?.payments?.[0]?.refundedAmount} vs ${rest.data?.total}`);

    // A replayed refund webhook must not inflate the total.
    const refundId = (await sandbox('/_control/state')).refunds.at(-1)?.id;
    const refundEvent = {
      event: 'refund.processed',
      payload: {
        payment: { entity: { id: rest.data?.payments?.[0]?.razorpayPaymentId, order_id: webhookOrder.rzpOrderId } },
        refund: { entity: { id: refundId, amount: 20000, status: 'processed', speed_processed: 'normal' } },
      },
    };
    await sendWebhook(refundEvent, { eventId: `evt_r1_${Date.now()}` });
    await sendWebhook(refundEvent, { eventId: `evt_r2_${Date.now()}` });
    const afterReplay = await call(`/admin/orders/${orderId}`, { token: adminToken });
    check('Replayed refund webhooks never inflate the refunded total',
      Number(afterReplay.data?.payments?.[0]?.refundedAmount) === Number(rest.data?.total),
      String(afterReplay.data?.payments?.[0]?.refundedAmount));

    // A paid order cannot simply be cancelled while money is still held.
    const paidToCancel = paidOrder;
    const cancel = await call(`/admin/orders/${paidToCancel.orderId}`, {
      method: 'PATCH', token: adminToken, body: { status: 'CANCELLED' },
    });
    check('A captured, unrefunded order cannot be cancelled without refunding',
      cancel.status === 400, `got ${cancel.status}`);

    const refundThenCancel = await call(`/admin/orders/${paidToCancel.orderId}/refund`, {
      method: 'POST', token: adminToken, body: { reason: 'Customer changed their mind' },
    });
    check('Refunding it succeeds', refundThenCancel.ok, JSON.stringify(refundThenCancel.error));
    const nowCancel = await call(`/admin/orders/${paidToCancel.orderId}`, {
      method: 'PATCH', token: adminToken, body: { status: 'CANCELLED' },
    });
    check('…after which it can be cancelled', nowCancel.ok, JSON.stringify(nowCancel.error));
  }

  // --------------------------------------------------------------- cleanup
  section('Cleanup');
  {
    await call('/admin/settings', {
      method: 'PUT', token: adminToken,
      body: { values: { 'payment.razorpayEnabled': false, 'payment.codEnabled': false } },
    });
    if (productId) await call(`/admin/products/${productId}`, { method: 'DELETE', token: adminToken });
    check('Settings restored and test product removed', true);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${c.bold('Result')}  ${c.green(`${passed} passed`)}${failed ? `, ${c.red(`${failed} failed`)}` : ''}`);
  console.log(`${'─'.repeat(60)}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red('\nPayment verification crashed:'), err);
  process.exit(1);
});
