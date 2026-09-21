/**
 * Test-only preload that points the Razorpay SDK at a local sandbox.
 *
 *   RAZORPAY_SANDBOX_URL=http://127.0.0.1:4999 \
 *   NODE_OPTIONS="--require ./scripts/razorpay-sandbox.cjs" node dist/index.js
 *
 * It changes nothing in the application: the server still builds a real
 * Razorpay client, signs with the real HMAC and runs every verification check.
 * Only the transport's base URL moves, so the whole payment flow — order
 * creation, capture verification, webhooks and refunds — can be exercised
 * end to end without live gateway keys.
 *
 * Refuses to load unless RAZORPAY_SANDBOX_URL points at loopback, so it can
 * never silently redirect a production server's payment traffic.
 */

const url = process.env.RAZORPAY_SANDBOX_URL;

if (url) {
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error(`RAZORPAY_SANDBOX_URL must be loopback, got ${hostname}`);
  }

  const API = require('razorpay/dist/api');
  const original = API.prototype._createConfig;
  API.prototype._createConfig = function patched(options) {
    return original.call(this, { ...options, hostUrl: url });
  };

  console.warn(`[razorpay] SANDBOX MODE — API calls go to ${url}`);
}
