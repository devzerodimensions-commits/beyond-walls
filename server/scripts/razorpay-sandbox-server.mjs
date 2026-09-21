/**
 * A minimal stand-in for the Razorpay API, used with razorpay-sandbox.cjs to
 * exercise the real payment code without live gateway keys.
 *
 *   node scripts/razorpay-sandbox-server.mjs [port]
 *
 * Implements only what the server actually calls:
 *   POST /v1/orders
 *   GET  /v1/payments/:id
 *   POST /v1/payments/:id/refund     (idempotent on notes.idempotencyKey)
 *
 * Plus a control surface the test driver uses to stage scenarios:
 *   POST /_control/payment           create a payment in a chosen state
 *   POST /_control/outage            make the next fetch fail
 *   GET  /_control/state             inspect everything
 */

import http from 'http';
import crypto from 'crypto';

const PORT = Number(process.argv[2] ?? process.env.RAZORPAY_SANDBOX_PORT ?? 4999);

const orders = new Map();
const payments = new Map();
const refunds = new Map();
/** idempotencyKey -> refund id, mirroring Razorpay's own de-duplication. */
const refundKeys = new Map();
let outage = 0;

const id = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('hex')}`;

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function fail(res, status, code, description) {
  send(res, status, { error: { code, description, source: 'sandbox', step: null, reason: null } });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  const body = req.method === 'POST' ? await readJson(req) : {};

  // ---------------------------------------------------------- control API
  if (pathname === '/_control/state') {
    return send(res, 200, {
      orders: [...orders.values()],
      payments: [...payments.values()],
      refunds: [...refunds.values()],
    });
  }

  if (pathname === '/_control/reset') {
    orders.clear(); payments.clear(); refunds.clear(); refundKeys.clear(); outage = 0;
    return send(res, 200, { ok: true });
  }

  if (pathname === '/_control/outage') {
    outage = Number(body.count ?? 1);
    return send(res, 200, { ok: true, outage });
  }

  /**
   * Stages a payment exactly as Razorpay would hold it after checkout.
   * The driver then signs order_id|payment_id itself with the same secret
   * the server uses, which is what the browser handler would hand back.
   */
  if (pathname === '/_control/payment') {
    const paymentId = body.id ?? id('pay');
    const payment = {
      id: paymentId,
      entity: 'payment',
      order_id: body.order_id ?? null,
      status: body.status ?? 'captured',
      amount: Number(body.amount ?? 0),
      currency: body.currency ?? 'INR',
      method: body.method ?? 'upi',
      vpa: body.method === 'card' ? null : 'test@razorpay',
      bank: null,
      wallet: null,
      card: body.method === 'card' ? { last4: '1111', network: 'Visa' } : undefined,
      error_code: body.error_code ?? null,
      error_description: body.error_description ?? null,
      captured: (body.status ?? 'captured') === 'captured',
      amount_refunded: 0,
    };
    payments.set(paymentId, payment);
    return send(res, 200, payment);
  }

  // ------------------------------------------------------------ orders API
  if (pathname === '/v1/orders' && req.method === 'POST') {
    if (body.amount == null || Number(body.amount) < 100) {
      return fail(res, 400, 'BAD_REQUEST_ERROR', 'amount must be at least 100');
    }
    const order = {
      id: id('order'),
      entity: 'order',
      amount: Number(body.amount),
      amount_paid: 0,
      amount_due: Number(body.amount),
      currency: body.currency ?? 'INR',
      receipt: body.receipt ?? null,
      status: 'created',
      notes: body.notes ?? {},
      created_at: Math.floor(Date.now() / 1000),
    };
    orders.set(order.id, order);
    return send(res, 200, order);
  }

  // ---------------------------------------------------------- payments API
  const fetchMatch = pathname.match(/^\/v1\/payments\/([^/]+)$/);
  if (fetchMatch && req.method === 'GET') {
    if (outage > 0) {
      outage -= 1;
      // Razorpay unreachable: the server must NOT mark the order paid.
      res.destroy();
      return undefined;
    }
    const payment = payments.get(fetchMatch[1]);
    if (!payment) return fail(res, 400, 'BAD_REQUEST_ERROR', 'The id provided does not exist');
    return send(res, 200, payment);
  }

  const refundMatch = pathname.match(/^\/v1\/payments\/([^/]+)\/refund$/);
  if (refundMatch && req.method === 'POST') {
    const payment = payments.get(refundMatch[1]);
    if (!payment) return fail(res, 400, 'BAD_REQUEST_ERROR', 'The id provided does not exist');
    if (payment.status !== 'captured') {
      return fail(res, 400, 'BAD_REQUEST_ERROR', 'Only captured payments can be refunded');
    }

    const key = body.notes?.idempotencyKey;
    if (key && refundKeys.has(key)) {
      // Razorpay returns the ORIGINAL refund, it does not create a second one.
      return send(res, 200, refunds.get(refundKeys.get(key)));
    }

    const amount = Number(body.amount ?? payment.amount - payment.amount_refunded);
    if (amount <= 0 || amount > payment.amount - payment.amount_refunded) {
      return fail(res, 400, 'BAD_REQUEST_ERROR', 'The refund amount is greater than the amount available');
    }

    const refund = {
      id: id('rfnd'),
      entity: 'refund',
      payment_id: payment.id,
      amount,
      currency: payment.currency,
      status: 'processed',
      speed_processed: 'normal',
      notes: body.notes ?? {},
      created_at: Math.floor(Date.now() / 1000),
    };
    payment.amount_refunded += amount;
    refunds.set(refund.id, refund);
    if (key) refundKeys.set(key, refund.id);
    return send(res, 200, refund);
  }

  return fail(res, 404, 'BAD_REQUEST_ERROR', `sandbox has no route for ${req.method} ${pathname}`);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[razorpay-sandbox] listening on http://127.0.0.1:${PORT}`);
});
