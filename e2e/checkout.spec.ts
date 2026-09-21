import { expect, test } from '@playwright/test';

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
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@beyondwall.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

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
});

test.afterAll(async () => {
  if (couponId) await adminFetch(`/admin/coupons/${couponId}`, { method: 'DELETE' });
  await adminFetch('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ values: { 'payment.codEnabled': false } }),
  });
});

test('a customer can register, personalise, apply a coupon and pay cash on delivery', async ({ page }, testInfo) => {
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

  // ---- Product and personalisation ----------------------------------------
  await page.goto('/product/minimal-acrylic-name-plate');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Required personalisation must be filled, or the page refuses the add and
  // scrolls back to the field — which is the behaviour a customer gets too.
  const name = page.getByLabel('Name', { exact: true });
  await expect(name).toBeVisible();
  await name.fill('E2E Household');

  const houseNumber = page.getByLabel('House / flat number');
  if (await houseNumber.count()) await houseNumber.fill('A 01');

  // Options are buttons in a radiogroup, not native radios.
  const options = page.getByRole('radio');
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

  // ---- GST invoice --------------------------------------------------------
  await page.getByLabel(/I need a GST invoice/i).check();
  await page.getByLabel('Company name').fill('E2E Interiors Pvt Ltd');
  await page.getByLabel('GSTIN').fill('24AAAAA0000A1Z5');

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
  await expect(page.locator('main')).toContainText('E2E Interiors Pvt Ltd');
  await expect(page.locator('main')).toContainText('24AAAAA0000A1Z5');

  // ---- And the admin sees the same order ----------------------------------
  const orders = await adminFetch(`/admin/orders?search=${orderNumber}`);
  const listed = orders.data?.[0];
  expect(listed, 'the order reached the admin API').toBeTruthy();
  expect(listed.paymentMethod).toBe('COD');
  expect(listed.status).toBe('CONFIRMED');

  // The list is a summary; the money and the GST details live on the detail.
  const detail = (await adminFetch(`/admin/orders/${listed.id}`)).data;
  expect(Number(detail.discountAmount)).toBeGreaterThan(0);
  expect(detail.gstInvoice).toBe(true);
  expect(detail.companyName).toBe('E2E Interiors Pvt Ltd');
  expect(detail.gstin).toBe('24AAAAA0000A1Z5');
});

test('checkout refuses an invalid GSTIN', async ({ page }) => {
  await page.goto('/product/no-smoking-sign');
  const options = page.getByRole('radio');
  if (await options.count()) await options.first().click();
  await page.getByRole('button', { name: /^add to cart$/i }).first().click();

  await page.goto('/checkout');
  await page.getByLabel('Full name').fill('GST Tester');
  await page.getByLabel('Phone').first().fill('9876543210');
  const emailField = page.getByLabel('Email');
  if (await emailField.count()) await emailField.fill('gst.tester@example.com');

  await page.getByLabel('Recipient name').fill('GST Tester');
  await page.getByLabel('Address line 1').fill('Prime Center Mall');
  await page.getByLabel('PIN code').fill('380001');
  await page.getByLabel('City / town').fill('Ahmedabad');
  await page.getByLabel('State').selectOption({ label: 'Gujarat' });
  await page.getByLabel('Phone').last().fill('9876543210');

  await page.getByLabel(/I need a GST invoice/i).check();
  await page.getByLabel('Company name').fill('Bad GSTIN Ltd');
  await page.getByLabel('GSTIN').fill('NOT-A-GSTIN');

  await page.getByRole('button', { name: /^cash on delivery/i }).click();
  await page.getByRole('button', { name: /place order/i }).click();

  // It must stay on checkout and say why.
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.locator('main')).toContainText(/gstin/i);
});
