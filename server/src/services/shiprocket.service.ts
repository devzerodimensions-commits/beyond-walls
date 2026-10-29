import { env } from '../config/env';
import { ApiError } from '../utils/http';

/**
 * Shiprocket.
 *
 * The studio books every parcel through one aggregator account, so this is the
 * only courier integration the site has. Everything it needs is four calls:
 * sign in, check the pincode can be served, push the order across, and ask for
 * a waybill. Tracking comes back on its own, through the webhook in
 * webhook.routes.ts.
 *
 * Nothing here is called during checkout. A customer's order must never wait
 * on, or fail because of, somebody else's API — booking happens later, when the
 * studio marks the order ready to go.
 */

const BASE_URL = env.shiprocketBaseUrl.replace(/\/+$/, '');

export const shiprocketConfigured = Boolean(env.shiprocketEmail && env.shiprocketPassword);

/*
 * The token.
 *
 * Shiprocket's login returns a bearer token that lasts days, and logging in on
 * every request would be both slow and a good way to get rate-limited. It is
 * held in memory with its expiry, refreshed when it ages out, and thrown away
 * on a 401 so the next call fetches a fresh one rather than failing in a loop.
 *
 * In memory rather than in the database on purpose: a restart losing it costs
 * one extra login, while a token in a table is a credential at rest for no
 * benefit.
 */
let token: { value: string; expiresAt: number } | null = null;
let loginInFlight: Promise<string> | null = null;

/** Shiprocket does not state the lifetime in the response, so this is conservative. */
const TOKEN_TTL_MS = 8 * 24 * 60 * 60 * 1000;

async function login(): Promise<string> {
  if (!shiprocketConfigured) {
    throw ApiError.badRequest('Shiprocket is not configured on this server');
  }

  const response = await fetch(`${BASE_URL}/v1/external/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.shiprocketEmail, password: env.shiprocketPassword }),
  });

  const body = (await response.json().catch(() => ({}))) as { token?: string; message?: string };

  if (!response.ok || !body.token) {
    throw ApiError.badRequest(
      `Shiprocket sign-in failed: ${body.message ?? `HTTP ${response.status}`}`,
    );
  }

  token = { value: body.token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return body.token;
}

async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.value;
  // One login at a time. Three orders booked in quick succession after a
  // restart would otherwise each start their own.
  if (!loginInFlight) {
    loginInFlight = login().finally(() => {
      loginInFlight = null;
    });
  }
  return loginInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Set internally when a 401 has already been retried once. */
  retried?: boolean;
}

/**
 * One authenticated call.
 *
 * A 401 means the token went stale early — their stated lifetime is not a
 * promise — so it is discarded and the call made once more. Any second 401 is
 * a real credentials problem and is reported as one.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const bearer = await getToken();

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401 && !options.retried) {
    token = null;
    return request<T>(path, { ...options, retried: true });
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    /*
     * Shiprocket reports a rejected field in `errors`, keyed by field name,
     * and that is almost always the useful part — "pickup_location is
     * invalid", "weight is required". Flattened into the message so the studio
     * reads what to fix rather than "HTTP 422".
     */
    const errors = payload.errors as Record<string, string[] | string> | undefined;
    const detail = errors
      ? Object.entries(errors)
          .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : value}`)
          .join(' · ')
      : (payload.message as string | undefined);

    throw ApiError.badRequest(`Shiprocket: ${detail ?? `HTTP ${response.status}`}`);
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// What the site actually asks for
// ---------------------------------------------------------------------------

/** Proves the credentials and the base URL in one call, and changes nothing. */
export async function testConnection(): Promise<{ ok: true; mode: string }> {
  token = null; // a cached token would hide a password that has since changed
  await login();
  return { ok: true, mode: env.shiprocketBaseUrl.includes('sandbox') ? 'sandbox' : 'live' };
}

export interface ServiceabilityResult {
  available: boolean;
  cheapest?: { courierId: number; courierName: string; rate: number; estimatedDays?: string };
  reason?: string;
}

/**
 * Can this pincode be reached, and what would it cost.
 *
 * Used to tell the studio what a parcel will cost before they commit to it,
 * and to catch an unservable pincode at the point of booking rather than when
 * a label fails. Never shown to a customer as a quote — the rate the customer
 * pays is the studio's own flat charge, set in the admin panel, not whatever
 * the courier happens to quote on the day.
 */
export async function checkServiceability(input: {
  deliveryPincode: string;
  weightKg: number;
  codAmount?: number;
}): Promise<ServiceabilityResult> {
  const data = await request<{
    data?: { available_courier_companies?: Record<string, unknown>[] };
  }>('/v1/external/courier/serviceability/', {
    query: {
      pickup_postcode: env.shiprocketPickupPincode,
      delivery_postcode: input.deliveryPincode,
      weight: input.weightKg,
      cod: input.codAmount && input.codAmount > 0 ? 1 : 0,
    },
  });

  const couriers = data.data?.available_courier_companies ?? [];
  if (!couriers.length) {
    return { available: false, reason: 'No courier serves that pincode for this weight' };
  }

  // Cheapest first. The studio can always override in Shiprocket's own panel;
  // this is only what the site reports and pre-selects.
  const sorted = [...couriers].sort((a, b) => Number(a.rate ?? 0) - Number(b.rate ?? 0));
  const best = sorted[0];

  return {
    available: true,
    cheapest: {
      courierId: Number(best.courier_company_id),
      courierName: String(best.courier_name ?? 'Courier'),
      rate: Number(best.rate ?? 0),
      estimatedDays: best.etd ? String(best.etd) : undefined,
    },
  };
}

export interface BookingInput {
  orderNumber: string;
  placedAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: Record<string, string>;
  paymentMethod: string;
  total: number;
  /** Amount to collect on delivery. Zero for a prepaid order. */
  codAmount: number;
  items: {
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
  }[];
  /** Totals for the whole parcel. */
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

export interface BookingResult {
  courierOrderId: string;
  courierShipmentId: string;
}

/**
 * Hands an order to the courier.
 *
 * `order_id` is our own order number, which Shiprocket echoes back on every
 * tracking event. That is what lets a webhook find the order again without
 * trusting an id we did not issue.
 *
 * Sub-units are deliberately not used: Shiprocket works in rupees, unlike
 * Razorpay which works in paise, and conflating the two is the classic way to
 * declare a parcel worth a hundred times what it is.
 */
export async function bookShipment(input: BookingInput): Promise<BookingResult> {
  const address = input.shippingAddress;

  const data = await request<{ order_id?: number | string; shipment_id?: number | string }>(
    '/v1/external/orders/create/adhoc',
    {
      method: 'POST',
      body: {
        order_id: input.orderNumber,
        order_date: input.placedAt.toISOString().slice(0, 10),
        pickup_location: env.shiprocketPickupLocation,

        billing_customer_name: address.fullName || input.customerName,
        billing_last_name: '',
        billing_address: address.line1 ?? '',
        billing_address_2: address.line2 ?? '',
        billing_city: address.city ?? '',
        billing_pincode: address.pincode ?? '',
        billing_state: address.state ?? '',
        billing_country: 'India',
        billing_email: input.customerEmail,
        billing_phone: (address.phone || input.customerPhone).replace(/\D/g, '').slice(-10),
        shipping_is_billing: true,

        order_items: input.items.map((item) => ({
          name: item.name,
          sku: item.sku,
          units: item.quantity,
          selling_price: item.unitPrice,
        })),

        payment_method: input.codAmount > 0 ? 'COD' : 'Prepaid',
        sub_total: input.total,

        length: input.lengthCm,
        breadth: input.breadthCm,
        height: input.heightCm,
        weight: input.weightKg,
      },
    },
  );

  if (!data.shipment_id) {
    throw ApiError.badRequest('Shiprocket accepted the order but returned no shipment id');
  }

  return {
    courierOrderId: String(data.order_id ?? ''),
    courierShipmentId: String(data.shipment_id),
  };
}

export interface AwbResult {
  awb: string;
  courierName: string;
  trackingUrl: string;
}

/**
 * Asks for a waybill, which is the number the customer tracks.
 *
 * With no courier id Shiprocket picks by the account's own courier rules,
 * which is what the studio configures in their panel and is usually the right
 * answer — this is not the place to second-guess it.
 */
export async function assignAwb(input: {
  shipmentId: string;
  courierId?: number;
}): Promise<AwbResult> {
  const data = await request<{
    response?: { data?: Record<string, unknown> };
  }>('/v1/external/courier/assign/awb', {
    method: 'POST',
    body: {
      shipment_id: Number(input.shipmentId),
      ...(input.courierId ? { courier_id: input.courierId } : {}),
    },
  });

  const assigned = data.response?.data ?? {};
  const awb = String(assigned.awb_code ?? '');

  if (!awb) {
    throw ApiError.badRequest(
      'Shiprocket could not assign a waybill. Check the wallet balance and that a courier serves this pincode.',
    );
  }

  return {
    awb,
    courierName: String(assigned.courier_name ?? 'Courier'),
    // Shiprocket's own tracking page, which works for every courier it carries
    // and spares us a table of per-courier URL formats.
    trackingUrl: `https://shiprocket.co/tracking/${awb}`,
  };
}
