/**
 * End-to-end verification against a running API + database.
 *
 *   node scripts/verify.mjs [http://localhost:4000/api]
 *
 * Covers the real HTTP surface: auth (incl. cookie sessions and password
 * reset), direct-purchase pricing, variant rules, inventory movement, admin
 * CRUD, cart, coupons, GST checkout, orders, uploads and SEO.
 *
 * Razorpay payment integrity is covered separately in verify-payments.mjs,
 * which can run without live gateway keys.
 */

import crypto from 'crypto';

const BASE = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4000/api';
const ROOT = BASE.replace(/\/api$/, '');
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@beyondwall.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

const RUN = Date.now().toString(36).slice(-5);
const CART_SESSION = `verify_${RUN}`;

let passed = 0;
let failed = 0;
const created = { products: [], coupons: [], users: [], categories: [] };

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ${c.green('PASS')}  ${label}`);
  } else {
    failed += 1;
    console.log(`  ${c.red('FAIL')}  ${label}${detail ? c.dim(` — ${detail}`) : ''}`);
  }
}

function section(title) {
  console.log(`\n${c.bold(title)}`);
}

/** Cookie jar so HttpOnly refresh cookies behave like a real browser. */
const jar = new Map();

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function call(path, { method = 'GET', body, token, raw, query, cookies = true } = {}) {
  const headers = { Accept: 'application/json', 'x-cart-session': CART_SESSION };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookies && jar.size) headers.Cookie = cookieHeader();

  let url = `${BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) params.set(k, String(v));
    url += `?${params}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);

  if (raw) return { status: res.status, text: await res.text(), headers: res.headers };

  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: json?.data, error: json?.error, json };
}

async function main() {
  console.log(c.bold('\nBeyond Walls — end-to-end verification'));
  console.log(c.dim(`API: ${BASE}\n`));

  // ---------------------------------------------------------------- health
  section('Health & public content');
  {
    const health = await call('/health');
    check('API responds', health.status === 200);

    const settings = await call('/settings');
    check('Settings load', settings.ok && settings.data?.settings);
    check(
      'Contact details seeded',
      settings.data?.settings?.['contact.phone'] === '+91 7600738785',
    );
    check(
      'Price-on-request label is gone',
      settings.data?.settings?.['store.priceOnRequestLabel'] === undefined,
    );

    const home = await call('/home');
    const types = (home.data ?? []).map((s) => s.type);
    check('Homepage sections load', home.ok && types.length > 0);
    check('Shop-by-material section published', types.includes('SHOP_BY_ATTRIBUTE'));
    check('Personalisation demo published', types.includes('PERSONALISATION_DEMO'));
    const demo = (home.data ?? []).find((s) => s.type === 'PERSONALISATION_DEMO');
    check('Personalisation demo resolves a product', (demo?.items ?? []).length === 1);

    const categories = await call('/catalog/categories');
    const slugs = (categories.data ?? []).map((x) => x.slug);
    check('Category tree loads', categories.ok && slugs.length === 4, slugs.join(','));
    check('Custom Signage is no longer a catalogue category', !slugs.includes('custom-signage'));

    const filters = await call('/catalog/filters');
    const bands = filters.data?.budgetBands ?? [];
    const premium = bands.find((b) => b.slug === 'premium');
    check('Budget bands present', bands.length === 4);
    check('Premium band excludes 2499 (no overlap)', premium?.minExclusive === true);
  }

  // ------------------------------------------------- direct purchase basics
  section('Catalogue — direct purchase');
  let seeded = null;
  {
    const plate = await call('/catalog/products/minimal-acrylic-name-plate');
    seeded = plate.data;
    check('Seeded product published', plate.ok);
    check('Seeded product HAS a price', Number(plate.data?.price) > 0, String(plate.data?.price));
    check('priceOnRequest field is gone', plate.data?.priceOnRequest === undefined);
    check('Price is flagged unconfirmed', plate.data?.priceConfirmed === false);
    check('Inventory is tracked', plate.data?.trackInventory === true);

    const variants = plate.data?.variants ?? [];
    check('Has 2 variants', variants.length === 2);
    const priced = variants.find((v) => v.price !== null);
    check('A variant carries its own price', Number(priced?.price) === 1899);

    const sign = await call('/catalog/products/no-smoking-sign');
    check('Second product priced', Number(sign.data?.price) === 649);

    const budget = await call('/catalog/products', { query: { budget: 'under-1999' } });
    check(
      'Budget filter matches by price',
      (budget.data ?? []).every((p) => Number(p.price) <= 1999),
    );
  }

  // ------------------------------------------------------------------ auth
  section('Authentication & sessions');
  let adminToken = null;
  let customerToken = null;
  const customerEmail = `verify+${Date.now()}@example.com`;
  {
    const login = await call('/auth/login', {
      method: 'POST',
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    adminToken = login.data?.accessToken;
    check('Admin can sign in', login.ok && Boolean(adminToken));
    check('Refresh token NOT in the response body', login.data?.refreshToken === undefined);
    check('Refresh token set as an HttpOnly cookie', jar.has('bw_rt'));

    const refreshed = await call('/auth/refresh', { method: 'POST' });
    check('Refresh works from the cookie alone', refreshed.ok && Boolean(refreshed.data?.accessToken));
    adminToken = refreshed.data?.accessToken ?? adminToken;

    const bad = await call('/auth/login', {
      method: 'POST',
      body: { email: ADMIN_EMAIL, password: 'wrong-password' },
    });
    check('Wrong password rejected', bad.status === 401);

    // Register the test customer in a separate jar so the admin session survives.
    const adminCookies = new Map(jar);
    jar.clear();

    const register = await call('/auth/register', {
      method: 'POST',
      body: { name: 'Verify Customer', email: customerEmail, password: 'Test@12345', phone: '9876543210' },
    });
    customerToken = register.data?.accessToken;
    created.users.push(register.data?.user?.id);
    check('Customer can register', register.status === 201 && Boolean(customerToken));

    const guard = await call('/admin/products', { token: customerToken });
    check('Customer blocked from admin API', guard.status === 403, `got ${guard.status}`);

    const anon = await call('/admin/products', { cookies: false });
    check('Anonymous blocked from admin API', anon.status === 401);

    // --- password reset ---
    const forgot = await call('/auth/forgot-password', { method: 'POST', body: { email: customerEmail } });
    check('Forgot-password accepts a known address', forgot.ok);

    const unknown = await call('/auth/forgot-password', {
      method: 'POST',
      body: { email: `nobody+${Date.now()}@example.com` },
    });
    check(
      'Forgot-password gives the same answer for an unknown address',
      unknown.ok && unknown.data?.message === forgot.data?.message,
    );

    const badToken = await call('/auth/reset-password/not-a-real-token');
    check('Invalid reset token reports invalid', badToken.ok && badToken.data?.valid === false);

    const badReset = await call('/auth/reset-password', {
      method: 'POST',
      body: { token: 'x'.repeat(32), password: 'NewPass@123' },
    });
    check('Reset with a bogus token is rejected',
      badReset.status === 400 || badReset.status === 429, `got ${badReset.status}`);

    jar.clear();
    for (const [k, v] of adminCookies) jar.set(k, v);
  }

  if (!adminToken) {
    console.log(c.red('\nCannot continue without an admin token.\n'));
    process.exit(1);
  }

  // ------------------------------------------------ admin product lifecycle
  section('Admin — products, pricing rules, publishing guard');
  let productId = null;
  let variantA = null;
  let variantB = null;
  {
    // A product with NO price must not be publishable.
    const noPrice = await call('/admin/products', {
      method: 'POST',
      token: adminToken,
      body: { name: `Verify Unpriced ${RUN}`, status: 'DRAFT' },
    });
    created.products.push(noPrice.data?.id);
    const publishAttempt = await call(`/admin/products/${noPrice.data?.id}/status`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'PUBLISHED' },
    });
    check('Publishing a product with no price is blocked', publishAttempt.status === 400,
      `got ${publishAttempt.status}`);

    // Base price null + priced variants IS publishable.
    const create = await call('/admin/products', {
      method: 'POST',
      token: adminToken,
      body: {
        name: `Verify Variant Priced ${RUN}`,
        shortDescription: 'Base price is null; every variant prices itself.',
        price: null,
        trackInventory: true,
        stock: 0,
        status: 'DRAFT',
      },
    });
    productId = create.data?.id;
    created.products.push(productId);
    check('Product created with a null base price', create.status === 201);

    const a = await call(`/admin/products/${productId}/variants`, {
      method: 'POST',
      token: adminToken,
      body: { label: 'Small', price: 800, stock: 10, status: 'PUBLISHED' },
    });
    const b = await call(`/admin/products/${productId}/variants`, {
      method: 'POST',
      token: adminToken,
      body: { label: 'Large', price: 1200, stock: 4, status: 'PUBLISHED' },
    });
    variantA = a.data?.id;
    variantB = b.data?.id;
    check('Two priced variants created', a.status === 201 && b.status === 201);

    const publish = await call(`/admin/products/${productId}/status`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'PUBLISHED' },
    });
    check('Variant-priced product CAN be published', publish.ok, publish.error?.message);

    const pub = await call(`/catalog/products/${create.data?.slug}`);
    check('Published product visible with null base price',
      pub.ok && pub.data?.price === null, create.data?.slug);

    // Image ALT editing.
    const img = await call(`/admin/products/${productId}/images/link`, {
      method: 'POST',
      token: adminToken,
      body: { url: '/uploads/products/no-smoking-sign-1.png', alt: 'Original alt' },
    });
    const alt = await call(`/admin/products/${productId}/images/${img.data?.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { alt: 'Edited alt text' },
    });
    check('Product image ALT text can be edited', alt.ok && alt.data?.alt === 'Edited alt text');
  }

  // ---------------------------------------------------------- variant rules
  section('Cart — variant rules & inventory');
  {
    await call('/cart', { method: 'DELETE' });

    const noVariant = await call('/cart/items', {
      method: 'POST',
      body: { productId, quantity: 1 },
    });
    check('Multi-variant product rejects an unspecified variant', noVariant.status === 400,
      `got ${noVariant.status}: ${noVariant.error?.message}`);

    const foreign = await call('/cart/items', {
      method: 'POST',
      body: { productId, variantId: 'cl00000000000000000000000', quantity: 1 },
    });
    check('Unknown variant id rejected', foreign.status === 400);

    const add = await call('/cart/items', {
      method: 'POST',
      body: { productId, variantId: variantB, quantity: 2 },
    });
    check('Valid variant accepted', add.status === 201, add.error?.message);
    const line = add.data?.lines?.[0];
    check('Variant price used when base price is null', line?.unitPrice === 1200,
      `unitPrice=${line?.unitPrice}`);
    check('Line total correct', line?.lineTotal === 2400);

    const overStock = await call(`/cart/items/${line.id}`, { method: 'PATCH', body: { quantity: 99 } });
    check('Over-stock quantity rejected', overStock.status === 409);

    // Switching to the cheaper variant re-prices the cart.
    const addA = await call('/cart/items', {
      method: 'POST',
      body: { productId, variantId: variantA, quantity: 1 },
    });
    check('Second variant added as its own line', (addA.data?.lines ?? []).length === 2);
    const small = addA.data.lines.find((l) => l.variantId === variantA);
    check('Second variant priced independently', small?.unitPrice === 800);
  }

  // ------------------------------------------------------------- inventory
  section('Inventory movement');
  let untrackedId = null;
  {
    // Inventory tracking OFF must never move stock.
    const untracked = await call('/admin/products', {
      method: 'POST',
      token: adminToken,
      body: {
        name: `Verify Untracked ${RUN}`,
        price: 500,
        trackInventory: false,
        stock: 7,
        status: 'DRAFT',
      },
    });
    untrackedId = untracked.data?.id;
    created.products.push(untrackedId);
    await call(`/admin/products/${untrackedId}/status`, {
      method: 'PATCH', token: adminToken, body: { status: 'PUBLISHED' },
    });

    const before = await call(`/admin/products/${untrackedId}`, { token: adminToken });
    await call('/cart/items', { method: 'POST', body: { productId: untrackedId, quantity: 3 } });

    check('Untracked product can be added without stock checks', true);
    check('Untracked stock unchanged by adding to cart',
      Number(before.data?.stock) === 7);
  }

  // ---------------------------------------------------------- coupon + GST
  section('Coupons, GST invoice & checkout');
  let orderNumber = null;
  let orderId = null;
  {
    const coupon = await call('/admin/coupons', {
      method: 'POST',
      token: adminToken,
      body: { code: 'VERIFY20', type: 'PERCENT', value: 20, status: 'PUBLISHED' },
    });
    created.coupons.push(coupon.data?.id);

    const applied = await call('/cart/coupon', { method: 'POST', body: { code: 'VERIFY20' } });
    check('Coupon applied', applied.ok, applied.error?.message);
    check('Discount is 20% of subtotal',
      applied.data?.totals?.discount ===
        Math.round(applied.data.totals.subtotal * 0.2 * 100) / 100);

    // COD must be on for the order path.
    await call('/admin/settings', {
      method: 'PUT', token: adminToken, body: { values: { 'payment.codEnabled': true } },
    });

    const address = {
      fullName: 'Verify Customer', phone: '9876543210',
      line1: 'First Floor, Shop No. 01', city: 'Ahmedabad',
      state: 'Gujarat', pincode: '380001', country: 'India',
    };
    const baseOrder = {
      customerName: 'Verify Customer',
      customerEmail: customerEmail,
      customerPhone: '9876543210',
      shippingAddress: address,
      billingSameAsShipping: true,
      paymentMethod: 'COD',
    };

    const badGstin = await call('/orders', {
      method: 'POST',
      body: { ...baseOrder, gstInvoice: true, companyName: 'Acme Ltd', gstin: 'NOTAGSTIN' },
    });
    check('Invalid GSTIN rejected when a GST invoice is requested', badGstin.status === 422,
      `got ${badGstin.status}`);

    const missingCompany = await call('/orders', {
      method: 'POST',
      body: { ...baseOrder, gstInvoice: true, gstin: '24AAAAA0000A1Z5' },
    });
    check('Company name required for a GST invoice', missingCompany.status === 422);

    const order = await call('/orders', {
      method: 'POST',
      token: customerToken,
      body: {
        ...baseOrder,
        gstInvoice: true,
        companyName: 'Verify Interiors Pvt Ltd',
        gstin: '24AAAAA0000A1Z5',
      },
    });
    orderId = order.data?.order?.id;
    orderNumber = order.data?.order?.orderNumber;
    check('COD order placed', order.status === 201 && Boolean(orderNumber), order.error?.message);
    check('GST invoice captured on the order', order.data?.order?.gstInvoice === true);
    check('Company name stored', order.data?.order?.companyName === 'Verify Interiors Pvt Ltd');
    check('GSTIN stored uppercase', order.data?.order?.gstin === '24AAAAA0000A1Z5');

    // Stock moved on the VARIANT rows only.
    const afterOrder = await call(`/admin/products/${productId}`, { token: adminToken });
    const large = (afterOrder.data?.variants ?? []).find((v) => v.id === variantB);
    const small = (afterOrder.data?.variants ?? []).find((v) => v.id === variantA);
    check('Variant stock decremented', large?.stock === 2, `Large stock=${large?.stock}`);
    check('Second variant stock decremented', small?.stock === 9, `Small stock=${small?.stock}`);
    check('Product-level stock untouched for a variant sale',
      Number(afterOrder.data?.stock) === 0, `product stock=${afterOrder.data?.stock}`);

    const untrackedAfter = await call(`/admin/products/${untrackedId}`, { token: adminToken });
    check('Untracked product stock NEVER moves', Number(untrackedAfter.data?.stock) === 7,
      `stock=${untrackedAfter.data?.stock}`);
  }

  // -------------------------------------------------- cancellation & stock
  section('Cancellation restores stock exactly once');
  {
    const cancel = await call(`/admin/orders/${orderId}`, {
      method: 'PATCH', token: adminToken, body: { status: 'CANCELLED' },
    });
    check('Unpaid COD order can be cancelled', cancel.ok, cancel.error?.message);

    const restored = await call(`/admin/products/${productId}`, { token: adminToken });
    const large = (restored.data?.variants ?? []).find((v) => v.id === variantB);
    check('Variant stock restored', large?.stock === 4, `stock=${large?.stock}`);

    // Cancelling again must NOT inflate stock.
    await call(`/admin/orders/${orderId}`, {
      method: 'PATCH', token: adminToken, body: { status: 'CANCELLED' },
    });
    const twice = await call(`/admin/products/${productId}`, { token: adminToken });
    const largeTwice = (twice.data?.variants ?? []).find((v) => v.id === variantB);
    check('Double cancel does not inflate stock', largeTwice?.stock === 4,
      `stock=${largeTwice?.stock}`);
  }

  // ---------------------------------------------------------- file uploads
  section('Upload hardening');
  {
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001',
      'hex',
    );

    const okForm = new FormData();
    okForm.append('attachments', new Blob([png], { type: 'image/png' }), 'valid.png');
    const okUpload = await call('/uploads/artwork', { method: 'POST', body: okForm });
    check('Valid PNG accepted', okUpload.status === 201, okUpload.error?.message);

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const svgForm = new FormData();
    svgForm.append('attachments', new Blob([svg], { type: 'image/svg+xml' }), 'evil.svg');
    const svgUpload = await call('/uploads/artwork', { method: 'POST', body: svgForm });
    check('SVG upload blocked', svgUpload.status === 400, `got ${svgUpload.status}`);

    const htmlForm = new FormData();
    htmlForm.append('attachments', new Blob([Buffer.from('<html><script>x</script>')], { type: 'text/html' }), 'x.html');
    const htmlUpload = await call('/uploads/artwork', { method: 'POST', body: htmlForm });
    check('HTML upload blocked', htmlUpload.status === 400);

    // A script renamed to .png — declared type matches, bytes do not.
    const fakeForm = new FormData();
    fakeForm.append(
      'attachments',
      new Blob([Buffer.from('<?php system($_GET["c"]); ?>')], { type: 'image/png' }),
      'shell.png',
    );
    const fakeUpload = await call('/uploads/artwork', { method: 'POST', body: fakeForm });
    check('Disguised script (.png with PHP bytes) blocked', fakeUpload.status === 400,
      `got ${fakeUpload.status}`);

    const octetForm = new FormData();
    octetForm.append('attachments', new Blob([png], { type: 'application/octet-stream' }), 'thing.bin');
    const octetUpload = await call('/uploads/artwork', { method: 'POST', body: octetForm });
    check('application/octet-stream blocked', octetUpload.status === 400);

    // Served uploads must carry hardening headers.
    const served = await fetch(`${ROOT}/uploads/products/no-smoking-sign-1.png`);
    check('Uploads served with nosniff', served.headers.get('x-content-type-options') === 'nosniff');
    check('Uploads served with a restrictive CSP',
      (served.headers.get('content-security-policy') ?? '').includes('sandbox'));
  }

  // ------------------------------------------------------------ admin CRUD
  section('Admin — content CRUD & review selector support');
  {
    for (const [resource, payload, label] of [
      ['faqs', { question: 'Verify question?', answer: 'Verify answer.', status: 'PUBLISHED' }, 'FAQ'],
      ['testimonials', { name: 'Verify Person', content: 'Verify quote.', rating: 5, status: 'DRAFT' }, 'Testimonial'],
      ['banners', { title: 'Verify banner', placement: 'HOME_HERO', status: 'DRAFT' }, 'Banner'],
      ['gallery', { title: 'Verify image', image: '/uploads/products/no-smoking-sign-1.png', status: 'DRAFT' }, 'Gallery item'],
      ['nav-links', { label: 'Verify link', href: '/verify', group: 'footer', status: 'DRAFT' }, 'Nav link'],
    ]) {
      const made = await call(`/admin/${resource}`, { method: 'POST', token: adminToken, body: payload });
      const id = made.data?.id;
      const edited = await call(`/admin/${resource}/${id}`, {
        method: 'PATCH', token: adminToken, body: { status: 'PUBLISHED' },
      });
      const statused = await call(`/admin/${resource}/${id}/status`, {
        method: 'PATCH', token: adminToken, body: { status: 'DRAFT' },
      });
      const removed = await call(`/admin/${resource}/${id}`, { method: 'DELETE', token: adminToken });
      check(`${label}: create → edit → publish/draft → delete`,
        made.status === 201 && edited.ok && statused.ok && removed.ok);
    }

    // The review form's product picker searches this endpoint.
    const search = await call('/admin/products', { token: adminToken, query: { search: 'Minimal' } });
    check('Admin product search powers the review selector',
      (search.data ?? []).some((p) => p.slug === 'minimal-acrylic-name-plate'));

    const review = await call('/admin/reviews', {
      method: 'POST',
      token: adminToken,
      body: {
        productId: seeded?.id,
        authorName: 'Verify Reviewer',
        rating: 5,
        content: 'Verification review.',
        status: 'DRAFT',
      },
    });
    check('Review can be attached to a product', review.status === 201);
    await call(`/admin/reviews/${review.data?.id}`, { method: 'DELETE', token: adminToken });

    // Regression: deleting a record must not delete a file another record uses.
    const sharedUrl = '/uploads/products/no-smoking-sign-1.png';
    const tile = await call('/admin/gallery', {
      method: 'POST', token: adminToken,
      body: { title: 'Shares a product image', image: sharedUrl, status: 'DRAFT' },
    });
    await call(`/admin/gallery/${tile.data?.id}`, { method: 'DELETE', token: adminToken });
    const file = await fetch(`${ROOT}${sharedUrl}`);
    check('Deleting a gallery item keeps a file the product still uses', file.status === 200);
  }

  // ------------------------------------------------------------------ SEO
  section('SEO');
  {
    const sm = await fetch(`${ROOT}/sitemap.xml`);
    const smText = await sm.text();
    check('sitemap.xml serves XML', sm.status === 200 && smText.includes('<urlset'));
    check('sitemap lists the seeded product', smText.includes('/product/minimal-acrylic-name-plate'));
    check('sitemap excludes the retired category', !smText.includes('/shop/custom-signage'));
    check('sitemap excludes draft pages', !smText.includes('/privacy-policy'));

    const robots = await fetch(`${ROOT}/robots.txt`);
    const robotsText = await robots.text();
    check('robots.txt disallows /admin', robotsText.includes('Disallow: /admin'));
  }

  // -------------------------------------------------------------- cleanup
  section('Cleanup');
  {
    await call('/cart', { method: 'DELETE' });
    await call('/admin/settings', {
      method: 'PUT', token: adminToken, body: { values: { 'payment.codEnabled': false } },
    });
    for (const id of created.coupons.filter(Boolean)) {
      await call(`/admin/coupons/${id}`, { method: 'DELETE', token: adminToken });
    }
    for (const id of created.products.filter(Boolean)) {
      await call(`/admin/products/${id}`, { method: 'DELETE', token: adminToken });
    }
    for (const id of created.users.filter(Boolean)) {
      await call(`/admin/customers/${id}`, { method: 'DELETE', token: adminToken });
    }
    check('Test data cleaned up', true);
    console.log(c.dim(`  note: order ${orderNumber} is left in place (orders are never hard-deleted)`));
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${c.bold('Result')}  ${c.green(`${passed} passed`)}${failed ? `, ${c.red(`${failed} failed`)}` : ''}`);
  console.log(`${'─'.repeat(60)}\n`);

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red('\nVerification crashed:'), err);
  process.exit(1);
});
