import { expect, test } from '@playwright/test';

/**
 * The admin panel, driven through the browser: signing in, the launch
 * checklist, the searchable product selector, image alt text and the
 * per-product live preview configuration.
 */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@beyondwall.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email', { exact: false }).first().fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: false }).first().fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 20_000 });
});

test('the dashboard flags what is still provisional', async ({ page }) => {
  await expect(page.getByText(/before you go live/i)).toBeVisible();

  // Seeded prices are placeholders, so they must be called out by name.
  await expect(page.getByText(/placeholder price/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /minimal acrylic name plate/i }).first()).toBeVisible();

  // The domain was inferred, never confirmed.
  await expect(page.getByText(/domain has not been confirmed/i)).toBeVisible();
});

test('the SEO tab previews a search result and warns about the domain', async ({ page }) => {
  await page.goto('/admin/settings?group=seo');

  await expect(page.getByText(/search result preview/i)).toBeVisible();
  await expect(page.getByText(/this domain has not been confirmed/i)).toBeVisible();

  // Editing the title must change the preview immediately.
  const title = page.getByLabel('Default page title');
  const original = await title.inputValue();
  await title.fill('Preview Check Title');
  await expect(page.locator('main')).toContainText('Preview Check Title');

  // Character counts are part of the point of the preview.
  await expect(page.getByText(/title \d+\/60/i).first()).toBeVisible();

  await title.fill(original);
});

test('reviews are attached with a product search, not a pasted id', async ({ page }) => {
  await page.goto('/admin/reviews');
  await page.getByRole('button', { name: /add|new/i }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // The old field asked for a raw product id.
  await expect(dialog.getByText('Product ID')).toHaveCount(0);

  await dialog.getByRole('button', { name: /search for a product/i }).click();
  await dialog.getByPlaceholder(/type a product name/i).fill('Minimal');

  const result = dialog.getByRole('button', { name: /minimal acrylic name plate/i }).first();
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();

  // The chosen product now reads as a name, with its slug for confirmation.
  await expect(dialog).toContainText('Minimal Acrylic Name Plate');
  await expect(dialog).toContainText('/minimal-acrylic-name-plate');
});

test('product images have editable alt text', async ({ page }) => {
  await page.goto('/admin/products');
  await page.getByRole('link', { name: /minimal acrylic name plate/i }).first().click();
  await expect(page).toHaveURL(/\/admin\/products\//);

  await page.getByRole('button', { name: /^images$|^media$/i }).first().click();

  const altField = page.getByLabel('Alt text').first();
  await expect(altField).toBeVisible();

  const unique = `Alt text set by the E2E run ${Date.now()}`;
  await altField.fill(unique);
  await altField.blur();

  await expect(page.getByText(/alt text saved/i)).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await page.getByRole('button', { name: /^images$|^media$/i }).first().click();
  await expect(page.getByLabel('Alt text').first()).toHaveValue(unique);
});

test('the live preview is configurable per product', async ({ page }) => {
  await page.goto('/admin/products');
  await page.getByRole('link', { name: /minimal acrylic name plate/i }).first().click();

  await expect(page.getByText(/preview settings for this product/i)).toBeVisible();
  await expect(page.getByText(/following the template/i)).toBeVisible();

  // Overriding a placeholder must show up in the preview beside the form.
  const placeholder = page.getByLabel('Placeholder — line 1');
  await placeholder.fill('CONFIG TEST');

  const preview = page.locator('svg[aria-label*="preview" i]').last();
  await expect(preview).toContainText('CONFIG TEST');

  // And the product must now say it has overrides, with a way back.
  await expect(page.getByRole('button', { name: /reset to template/i })).toBeVisible();
  await page.getByRole('button', { name: /reset to template/i }).click();
  await expect(page.getByText(/following the template/i)).toBeVisible();
});

test('a non-admin cannot reach the admin panel', async ({ page, context }) => {
  await context.clearCookies();
  await page.evaluate(() => window.localStorage.clear()).catch(() => {});
  await page.goto('/admin/products');
  await expect(page).toHaveURL(/\/admin\/login/);
});
