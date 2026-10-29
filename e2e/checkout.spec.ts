import { expect, test } from '@playwright/test';
import { fillPersonalisation } from './helpers';

/**
 * The full purchase path, end to end in a real browser:
 *
 *   Product → Personalisation → Cart → Coupon → Checkout → COD → Order
 *            → Account → Admin
 *
 * Cash on delivery is enabled for the run and turned off again afterwards, so
 * the store is left exactly as it was found.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api';
/** The seed sets no default admin, so a missing value is a setup error, not a login failure. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run this suite — it matches the seeded admin.`);
  return value;
}

const ADMIN_EMAIL = requireEnv('SEED_ADMIN_EMAIL');
const ADMIN_PASSWORD = requireEnv('SEED_ADMIN_PASSWORD');

const COUPON = `E2E${Date.now().toString(36).slice(-5).toUpperCase()}`;

let adminToken = '';
let couponId = '';

async function adminFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      ...(init.headers ?? {}),
    },
  });
  return res.json() as Promise<{ data?: any; error?: any }>;
}

test.beforeAll(async () => {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json());
  adminToken = login.data.accessToken;

  await adminFetch('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ values: { 'payment.codEnabled': true } }),
  });

  const coupon = await adminFetch('/admin/coupons', {
    method: 'POST',
    body: JSON.stringify({ code: COUPON, type: 'PERCENT', value: 10, status: 'PUBLISHED' }),
  });
  couponId = coupon.data?.id ?? '';

  await restock();
});

/*
 * Puts the stock back before the run.
 *
 * This suite places real orders, and a real order takes real stock. Run it
 * enough times and the product it buys sells out, at which point the add-to-
 * cart test fails for a reason that has nothing to do with the code -- which
 * is exactly what happened after a few dozen runs.
 *
 * Topping up beforehand rather than restoring afterwards means an interrupted
 * run cannot leave the fixture empty either.
 */
async function restock() {
  const products = await adminFetch('/admin/products?perPage=100');

  for (const summary of products.data ?? []) {
    /*
     * The list stopped carrying variants when it was slimmed down for speed,
     * and this went on reading product.variants -- which was then always
     * empty, so it quietly restocked nothing. Stock drained to zero over the
     * following runs and every checkout test started failing on "out of
     * stock", which reads like a bug in the cart and is a bug in this fixture.
     * The detail endpoint still carries them.
     */
    const product = (await adminFetch(`/admin/products/${summary.id}`)).data;
    for (const variant of product?.variants ?? []) {
      if ((variant.stock ?? 0) >= 10) continue;
      await adminFetch(`/admin/products/${product.id}/variants/${variant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: 40 }),
      });
    }
  }
}

test.afterAll(async () => {
  if (couponId) await adminFetch(`/admin/coupons/${couponId}`, { method: 'DELETE' });
  await adminFetch('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ values: { 'payment.codEnabled': false } }),
  });
});

test('a customer can register, apply a coupon and pay cash on delivery', async ({ page }, testInfo) => {
  const email = `e2e.${testInfo.project.name}.${Date.now()}@example.com`;

  // ---- Register -----------------------------------------------------------
  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Customer');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone (optional)').fill('9876543210');
  await page.getByLabel('Password', { exact: true }).fill('Test@12345');
  await page.getByLabel('Confirm password').fill('Test@12345');
  await page.getByRole('button', { name: /create account|register|sign up/i }).click();
  await expect(page).toHaveURL(/\/account|\/$/, { timeout: 15_000 });

  /*
   * ---- Product ------------------------------------------------------------
   *
   * A stock item, because this journey ends in cash on delivery and a
   * made-to-order piece cannot be paid for that way -- see the test below.
   * Personalising a product is covered in storefront.spec.ts, where it belongs.
   */
  await page.goto('/product/no-smoking-sign');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Every published personalisation field is part of the production brief now,
  // so even a stock sign has to be answered before it can enter the cart.
  await fillPersonalisation(page, 'E2E Customer');

  // Options are buttons in a radiogroup, not native radios.
  const options = page.getByRole('radio').and(page.locator(':not([disabled])'));
  if (await options.count()) await options.first().click();

  await page.getByRole('button', { name: /^add to cart$/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // ---- Cart and coupon ----------------------------------------------------
  await page.goto('/cart');
  const money = (text: string) => Number(text.replace(/[^\d.]/g, ''));

  const couponInput = page.getByPlaceholder(/coupon|promo|code/i).first();
  await expect(couponInput).toBeVisible();
  await couponInput.fill(COUPON);
  await page.getByRole('button', { name: /apply/i }).first().click();

  await expect(page.locator('main')).toContainText(/discount/i, { timeout: 10_000 });

  const summary = await page.locator('main').innerText();
  const subtotal = money(summary.match(/subtotal[^₹]*₹\s?([\d,.]+)/i)![1]);
  const discount = money(summary.match(/discount[^₹]*₹\s?([\d,.]+)/i)![1]);
  // 10% off, to the rupee.
  expect(Math.abs(discount - subtotal * 0.1)).toBeLessThan(1);

  // ---- Checkout -----------------------------------------------------------
  await page.getByRole('link', { name: /checkout/i }).first().click();
  await expect(page).toHaveURL(/\/checkout/);

  /*
   * A ticked box has to show its tick.
   *
   * The checkmark was a Tailwind arbitrary value holding an inline SVG. A space
   * ends a class name and a data URI is mostly spaces, so that rule was never
   * generated -- while the checked:bg-ink sitting beside it was. Every ticked
   * box on the site, storefront and admin, filled in solid with nothing in it.
   * Nothing else catches this: the markup is right, the types are right, and
   * only the compiled stylesheet is short a rule. So this asks the browser what
   * it actually painted.
   */
  const billingSame = page.getByLabel(/billing address is the same/i);
  await expect(billingSame, 'billing defaults to the delivery address').toBeChecked();
  const painted = await billingSame.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(painted, 'a ticked box draws its tick').toContain('svg');

  // And the tick belongs to the checked state alone, not to every box. Shown on
  // the same control rather than a second one, so this cannot pass by accident
  // on a box that was never styled.
  await billingSame.uncheck();
  expect(
    await billingSame.evaluate((el) => getComputedStyle(el).backgroundImage),
    'an unticked box draws nothing',
  ).toBe('none');
  await billingSame.check();

  await page.getByLabel('Full name').fill('E2E Customer');
  await page.getByLabel('Phone').first().fill('9876543210');
  const emailField = page.getByLabel('Email');
  if (await emailField.count()) await emailField.fill(email);

  await page.getByLabel('Recipient name').fill('E2E Customer');
  await page.getByLabel('Address line 1').fill('First Floor, Shop No. 01');
  await page.getByLabel('PIN code').fill('380001');
  await page.getByLabel('City / town').fill('Ahmedabad');
  await page.getByLabel('State').selectOption({ label: 'Gujarat' });
  await page.getByLabel('Phone').last().fill('9876543210');

  /*
   * No GST invoice step.
   *
   * The studio is not GST-registered -- "Currently we are not planning to
   * register for GST" -- and only a registered business can raise one, so the
   * section is off by default and the checkout must not ask for a GSTIN it
   * cannot put on anything. The validation behind it is still covered, server
   * side, in verify.mjs, so turning the setting back on is safe.
   */
  await expect(page.getByLabel(/I need a GST invoice/i)).toHaveCount(0);

  // ---- Cash on delivery ---------------------------------------------------
  await page.getByRole('button', { name: /^cash on delivery/i }).click();

  await page.getByRole('button', { name: /place order/i }).click();

  // ---- Order confirmation -------------------------------------------------
  await expect(page).toHaveURL(/\/order\//, { timeout: 30_000 });
  const orderNumber = page.url().split('/order/')[1].split('?')[0];
  expect(orderNumber).toMatch(/^BW/);

  // Wait for the confirmation itself, not just the URL — the router changes the
  // address before the new page has rendered.
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible({ timeout: 20_000 });

  const confirmation = await page.locator('main').innerText();
  expect(confirmation).toContain(orderNumber);
  expect(confirmation.toLowerCase()).toContain('cash on delivery');

  // ---- The customer's own account -----------------------------------------
  await page.goto('/account/orders');
  await expect(page.locator('main')).toContainText(orderNumber, { timeout: 15_000 });

  await page.getByText(orderNumber).first().click();
  await expect(page.locator('main')).toContainText('No Smoking Sign');

  // ---- And the admin sees the same order ----------------------------------
  const orders = await adminFetch(`/admin/orders?search=${orderNumber}`);
  const listed = orders.data?.[0];
  expect(listed, 'the order reached the admin API').toBeTruthy();
  expect(listed.paymentMethod).toBe('COD');
  expect(listed.status).toBe('CONFIRMED');

  // The list is a summary; the money lives on the detail.
  const detail = (await adminFetch(`/admin/orders/${listed.id}`)).data;
  expect(Number(detail.discountAmount)).toBeGreaterThan(0);
  expect(detail.paymentMethod).toBe('COD');
});

test('a made-to-order piece cannot be paid for on delivery', async ({ page }) => {
  /*
   * The studio's rule: "Cash on delivery will be available for generic products
   * but we won't be having cash on delivery on custom Products like name
   * plates." A plate cut with somebody else's name cannot be resold if the
   * delivery is refused at the door; a stock sign can.
   *
   * One such item disqualifies the whole order rather than part of it, because
   * an order ships and is paid for as one thing -- so this also stands for a
   * basket holding both. The server enforces it independently of this page;
   * hiding a button only stops an honest customer.
   */
  await page.goto('/product/minimal-acrylic-name-plate');
  await fillPersonalisation(page, 'E2E Household');

  const options = page.getByRole('radio').and(page.locator(':not([disabled])'));
  if (await options.count()) await options.first().click();
  await page.getByRole('button', { name: /^add to cart$/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /payment/i }).first()).toBeVisible();

  // The option is gone, and the page says which piece is the reason: a payment
  // method that silently vanishes between one order and the next reads as a
  // fault, and the customer cannot act on it.
  await expect(page.getByRole('button', { name: /^cash on delivery/i })).toHaveCount(0);
  await expect(page.locator('main')).toContainText(/made to order/i);
  await expect(page.locator('main')).toContainText(/Minimal Acrylic Name Plate/i);
});

test('checkout does not ask for a GSTIN the studio cannot invoice against', async ({ page }) => {
  /*
   * A GST invoice can only be raised by a GST-registered business, and the
   * studio has said they are not registering for now. Asking anyway would
   * collect a number nobody can use and promise paperwork that never follows.
   *
   * This asserts the shipped configuration, not the feature: the GST step is
   * built and switchable in Settings -> Tax, and the validation behind it --
   * malformed GSTIN refused, company name required -- is covered server side in
   * verify.mjs, where it keeps working whether the section is shown or not.
   */
  await page.goto('/product/no-smoking-sign');
  await fillPersonalisation(page, 'GST Tester');
  const options = page.getByRole('radio').and(page.locator(':not([disabled])'));
  if (await options.count()) await options.first().click();
  await page.getByRole('button', { name: /^add to cart$/i }).first().click();

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /payment/i }).first()).toBeVisible();

  await expect(page.getByLabel(/I need a GST invoice/i)).toHaveCount(0);
  await expect(page.getByLabel('GSTIN')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/GST invoice/i);
});
