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
  await page.getByRole('button', { name: 'Questions', exact: true }).click();
  await expect(labels).toHaveCount(initialCount + 1, { timeout: 15_000 });

  // ---- Reorder ------------------------------------------------------------
  // Each block's controls name the block, so this cannot grab the wrong one.
  const firstLabelBefore = await labels.first().textContent();
  const secondName = (await labels.nth(1).textContent())!.replace(/^\d+\.\s*/, '');
  await page.getByRole('button', { name: `Move ${secondName} up` }).click();
  await expect(labels.first()).toContainText(secondName, { timeout: 15_000 });
  expect(await labels.first().textContent()).not.toBe(firstLabelBefore);

  // ---- Publish, then check the storefront ---------------------------------
  await page.getByRole('button', { name: /publish page/i }).click();
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
  await expect(page.getByText(/hidden from visitors/i)).toBeVisible({ timeout: 15_000 });

  // Still shown in the editor, so it can be brought back.
  await expect(labels).toHaveCount(total);

  // The public page serves one block fewer.
  const live = await fetch(`${API}/pages/${slug}/sections`).then((r) => r.json());
  expect(live.data.sections.length).toBe(total - 1);
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
