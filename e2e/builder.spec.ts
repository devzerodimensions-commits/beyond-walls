import { expect, test } from '@playwright/test';

/**
 * The visual page builder.
 *
 * Works on a page it creates and deletes itself, so a failing run can never
 * damage the real homepage.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@beyondwall.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

let adminToken = '';
const created: string[] = [];

async function adminFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      ...(init.headers ?? {}),
    },
  });
  return { status: res.status, body: (await res.json()) as { data?: any; error?: any } };
}

test.beforeAll(async () => {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json());
  adminToken = login.data.accessToken;
});

test.afterAll(async () => {
  for (const id of created) await adminFetch(`/admin/pages/${id}`, { method: 'DELETE' });
});

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

test('Design Pages lists every page and protects the ones the site depends on', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/design-pages');

  await expect(page.getByRole('heading', { name: 'Design Pages' })).toBeVisible();

  const homeRow = page.locator('tbody tr', { hasText: 'Home' }).first();
  await expect(homeRow).toContainText('/');
  await expect(homeRow).toContainText('Part of the site structure');

  // The homepage cannot be deleted, so it must not offer a delete button.
  await expect(homeRow.getByRole('button', { name: /delete/i })).toHaveCount(0);

  // An ordinary page can be.
  const aboutRow = page.locator('tbody tr', { hasText: 'About' }).first();
  await expect(aboutRow.getByRole('button', { name: /delete/i })).toHaveCount(1);
});

test('a page can be built, edited and reordered, and the storefront follows', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the editor requires a wider screen; see the phone test below');

  const title = `E2E Builder ${testInfo.project.name} ${Date.now().toString(36).slice(-4)}`;

  await signIn(page);
  await page.goto('/admin/design-pages');

  // ---- Create from a ready-made layout ------------------------------------
  await page.getByRole('button', { name: /add new page/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Page name').fill(title);
  await dialog.getByLabel('Start from a ready-made layout').selectOption({ label: 'About page' });
  await dialog.getByRole('button', { name: /create and open editor/i }).click();

  // Lands straight in the editor.
  await expect(page).toHaveURL(/\/admin\/builder\?page=/, { timeout: 20_000 });
  const slug = new URL(page.url()).searchParams.get('page')!;

  const row = (await adminFetch('/admin/builder/pages')).body.data.find(
    (p: { slug: string }) => p.slug === slug,
  );
  created.push(row.id);

  // ---- The layout laid down real blocks -----------------------------------
  const labels = page.locator('main span').filter({ hasText: /^\d+\./ });
  await expect(labels.first()).toBeVisible({ timeout: 15_000 });
  const initialCount = await labels.count();
  expect(initialCount).toBeGreaterThan(3);
  await expect(labels.first()).toContainText('1. Large banner');

  // ---- Select a block and edit it -----------------------------------------
  await page.locator('main button[aria-label^="Edit"]').first().click();
  await expect(page.getByText('Now editing')).toBeVisible();

  const heading = page.getByLabel('Heading', { exact: true });
  await heading.fill('Written by the browser test');
  await heading.blur();

  // The preview is the real page, so the new words appear in it.
  await expect(page.locator('main h1')).toContainText('Written by the browser test', {
    timeout: 15_000,
  });

  // ---- Add a block --------------------------------------------------------
  // The "+" between two blocks opens the picker, so choosing what to add and
  // choosing where it lands are the same gesture.
  await page.getByRole('button', { name: 'Add a block here' }).first().click();
  const palette = page.getByRole('dialog', { name: 'Add a block' });
  await expect(palette).toBeVisible();
  await palette.getByRole('button', { name: 'Questions', exact: true }).click();
  await expect(labels).toHaveCount(initialCount + 1, { timeout: 15_000 });

  // ---- Reorder ------------------------------------------------------------
  // Each block's controls name the block, so this cannot grab the wrong one.
  const firstLabelBefore = await labels.first().textContent();
  const secondName = (await labels.nth(1).textContent())!.replace(/^\d+\.\s*/, '');
  await page.getByRole('button', { name: `Move ${secondName} up` }).click();
  await expect(labels.first()).toContainText(secondName, { timeout: 15_000 });
  expect(await labels.first().textContent()).not.toBe(firstLabelBefore);

  // ---- Publish, then check the storefront ---------------------------------
  await page.getByRole('button', { name: /^publish$/i }).click();
  await expect(page.getByRole('button', { name: /unpublish/i })).toBeVisible({ timeout: 15_000 });

  await page.goto(`/${slug}`);
  await expect(page.locator('main')).toContainText('Written by the browser test', {
    timeout: 15_000,
  });
});

test('an empty page offers the ready-made layouts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the editor requires a wider screen; see the phone test below');

  const title = `E2E Empty ${testInfo.project.name} ${Date.now().toString(36).slice(-4)}`;

  const made = await adminFetch('/admin/builder/pages', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  created.push(made.body.data.id);

  await signIn(page);
  await page.goto(`/admin/builder?page=${made.body.data.slug}`);

  await expect(page.getByRole('heading', { name: /this page is empty/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: /complete home page/i }).first()).toBeVisible();
});

test('hiding a block keeps it off the live page but visible in the editor', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the editor requires a wider screen; see the phone test below');

  const title = `E2E Hide ${testInfo.project.name} ${Date.now().toString(36).slice(-4)}`;

  const made = await adminFetch('/admin/builder/pages', {
    method: 'POST',
    body: JSON.stringify({ title, layout: 'policy' }),
  });
  const pageId = made.body.data.id;
  const slug = made.body.data.slug;
  created.push(pageId);
  await adminFetch(`/admin/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'PUBLISHED' }),
  });

  await signIn(page);
  await page.goto(`/admin/builder?page=${slug}`);

  const labels = page.locator('main span').filter({ hasText: /^\d+\./ });
  await expect(labels.first()).toBeVisible({ timeout: 20_000 });
  const total = await labels.count();

  const firstName = (await labels.first().textContent())!.replace(/^\d+\.\s*/, '');
  await page.getByRole('button', { name: `Hide ${firstName}` }).click();

  // Still in the editor, marked as hidden, so it can be brought back.
  await expect(labels.first()).toContainText('hidden', { timeout: 15_000 });
  await expect(labels).toHaveCount(total);

  // The public page serves one block fewer.
  const live = await fetch(`${API}/pages/${slug}/sections`).then((r) => r.json());
  expect(live.data.sections.length).toBe(total - 1);
});

test('a block can be duplicated, removed, and put back', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the editor requires a wider screen');

  const made = await adminFetch('/admin/builder/pages', {
    method: 'POST',
    body: JSON.stringify({ title: `E2E Copy ${Date.now().toString(36).slice(-4)}`, layout: 'policy' }),
  });
  created.push(made.body.data.id);

  await signIn(page);
  await page.goto(`/admin/builder?page=${made.body.data.slug}`);

  const labels = page.locator('main span').filter({ hasText: /^\d+\./ });
  await expect(labels.first()).toBeVisible({ timeout: 20_000 });
  const total = await labels.count();
  const firstName = (await labels.first().textContent())!.replace(/^\d+\.\s*/, '');

  // ---- Duplicate ----------------------------------------------------------
  await page.getByRole('button', { name: `Duplicate ${firstName}` }).click();
  await expect(labels).toHaveCount(total + 1, { timeout: 15_000 });

  // ---- Remove, and change your mind ---------------------------------------
  await page.getByRole('button', { name: `Remove ${firstName}` }).first().click();
  await page.getByRole('button', { name: /remove block/i }).click();
  await expect(labels).toHaveCount(total, { timeout: 15_000 });

  // Deleting is the one action with no way back on its own, so the bar offers
  // one. It has to actually put the block back.
  await page.getByRole('button', { name: /undo delete/i }).click();
  await expect(labels).toHaveCount(total + 1, { timeout: 15_000 });
});

test('the page can be edited at phone and tablet width', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the editor requires a wider screen');

  const made = await adminFetch('/admin/builder/pages', {
    method: 'POST',
    body: JSON.stringify({ title: `E2E Widths ${Date.now().toString(36).slice(-4)}`, layout: 'policy' }),
  });
  created.push(made.body.data.id);

  await signIn(page);
  await page.goto(`/admin/builder?page=${made.body.data.slug}`);
  await expect(page.locator('main span').filter({ hasText: /^\d+\./ }).first()).toBeVisible({ timeout: 20_000 });

  const frame = page.locator('[data-editor-frame]');
  const wide = (await frame.boundingBox())!.width;

  expect(wide).toBeGreaterThan(900);

  // The frame is the real storefront at that width, not a scaled picture of it,
  // so it has to actually reach the phone width. Polled rather than read once:
  // the frame animates between widths and a single read lands mid-transition.
  await page.getByRole('button', { name: 'Phone' }).click();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeLessThanOrEqual(431);

  await page.getByRole('button', { name: 'Tablet' }).click();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(600);

  await page.getByRole('button', { name: 'Desktop' }).click();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(900);
});

test('a list field edits as rows, not as text', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the editor requires a wider screen');

  const made = await adminFetch('/admin/builder/pages', {
    method: 'POST',
    body: JSON.stringify({ title: `E2E List ${Date.now().toString(36).slice(-4)}`, layout: 'home' }),
  });
  created.push(made.body.data.id);

  await signIn(page);
  await page.goto(`/admin/builder?page=${made.body.data.slug}`);
  await page.getByRole('button', { name: 'Edit Benefits' }).click();

  const panel = page.locator('aside').last();

  /*
   * The benefits are records, not lines of text. Declared as a textarea they
   * rendered as '[object Object]' and, on the first keystroke, replaced the
   * whole array with a flat string -- which emptied the strip on the live page
   * with nothing to say it had.
   */
  await expect(panel).not.toContainText('[object Object]');

  // A page built from the layout starts with an empty list, which is the state
  // that used to be unreachable: the block drew nothing, so it could not be
  // clicked to fill in.
  const headings = panel.getByLabel('Short heading');
  await expect(headings).toHaveCount(0);
  await panel.getByRole('button', { name: /add another/i }).click();
  await expect(headings).toHaveCount(1);
  const rows = 1;

  await panel.getByLabel('One line about it').first().fill('A line about it');
  await headings.first().fill('Written by the browser test');
  await headings.first().blur();
  await expect(page.locator('[data-editor-frame]')).toContainText(/written by the browser test/i, {
    timeout: 15_000,
  });

  // The shape has to survive the edit, or the storefront stops rendering it.
  await expect.poll(async () => {
    const live = await adminFetch(`/admin/builder/pages/${made.body.data.slug}`);
    const strip = live.body.data.sections.find((x: { type: string }) => x.type === 'USP_STRIP');
    return Array.isArray(strip?.config?.items) && typeof strip.config.items[0] === 'object';
  }).toBe(true);

  await panel.getByRole('button', { name: /add another/i }).click();
  await expect(headings).toHaveCount(rows + 1);
});

test('on a phone the editor explains itself instead of rendering unusably', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'this is the phone behaviour');

  const made = await adminFetch('/admin/builder/pages', {
    method: 'POST',
    body: JSON.stringify({ title: `E2E Phone ${Date.now().toString(36).slice(-4)}`, layout: 'policy' }),
  });
  created.push(made.body.data.id);

  await signIn(page);
  await page.goto(`/admin/builder?page=${made.body.data.slug}`);

  await expect(page.getByRole('heading', { name: /needs a wider screen/i })).toBeVisible({
    timeout: 20_000,
  });

  // It still does what a phone can do well.
  await expect(page.getByRole('link', { name: /view the page/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /publish page/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /all pages/i })).toBeVisible();

  // And nothing spills off the side.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
