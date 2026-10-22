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

  await page.getByRole('tab', { name: /images|media/i }).first().click();

  const altField = page.getByLabel('Alt text').first();
  await expect(altField).toBeVisible();

  const unique = `Alt text set by the E2E run ${Date.now()}`;
  await altField.fill(unique);
  await altField.blur();

  await expect(page.getByText(/alt text saved/i)).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await page.getByRole('tab', { name: /images|media/i }).first().click();
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

test('new products keep images, variants and personalisation available', async ({ page }) => {
  await page.goto('/admin/products/new');

  for (const tab of ['Images', 'Variants', 'Personalisation']) {
    const control = page.getByRole('tab', { name: tab });
    await expect(control).toBeEnabled();
  }

  await page.getByRole('tab', { name: 'Images' }).click();
  await expect(page.getByText('Nothing is disabled.')).toBeVisible();
  await expect(page.getByRole('button', { name: /save draft & add images/i })).toBeVisible();
});

test('product options and preview colours are editable from the product workflow', async ({ page }) => {
  await page.goto('/admin/products');
  await page.getByRole('link', { name: /minimal acrylic name plate/i }).first().click();

  await page.getByRole('tab', { name: 'Organisation' }).click();
  await expect(page.getByText(/materials, colours, styles & typography/i)).toBeVisible();
  const addOption = page.getByRole('button', { name: /add option/i }).first();
  await addOption.click();
  await expect(page.getByRole('dialog').getByLabel('Option colour')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('tab', { name: 'Details' }).click();
  await expect(page.getByText('Plate colour choices')).toBeVisible();
  await expect(page.getByRole('button', { name: /add colour/i }).first()).toBeVisible();
  await expect(page.getByLabel('Default typography')).toBeEditable();
});

test('a non-admin cannot reach the admin panel', async ({ page, context }) => {
  await context.clearCookies();
  await page.evaluate(() => window.localStorage.clear()).catch(() => {});
  await page.goto('/admin/products');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('customers and administrators are managed together under Users', async ({ page }) => {
  await page.goto('/admin/customers');
  await expect(page).toHaveURL(/\/admin\/users$/);

  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();

  const roleFilter = page.getByLabel('Filter by role');
  await expect(roleFilter).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add user' }).first()).toBeVisible();

  /*
   * Narrowed to administrators before looking for one.
   *
   * This used to read the unfiltered first page, which held the admin only
   * while the shop was new: the suite registers a customer every time it buys
   * something and never removes them, so after a few hundred runs the list
   * opens on hundreds of e2e.* accounts, newest first, and the one account
   * that ships with the shop is pages away. Filtering says what the test
   * means -- an administrator is in the same list as the customers -- and
   * exercises the filter while it is here.
   */
  await roleFilter.selectOption('ADMIN');
  // Scoped to the table: the signed-in administrator is also named in the
  // shell around it, and that is not what this is asking about.
  // Scoped to the page body: the signed-in administrator is also named in the
  // shell around it, and that is not what this is asking about. Not scoped to a
  // table, because at phone width the list is cards.
  // Asserted on the content of the page rather than one node of it. The list
  // ships a table and a set of cards, one hidden at each width, so the email is
  // in the document more than once and picking a single node picks the hidden
  // one half the time.
  await expect(page.locator('main')).toContainText(ADMIN_EMAIL);

  await page.goto('/admin/users/new');
  await expect(page.getByRole('heading', { name: 'Add user', exact: true })).toBeVisible();
  await expect(page.getByLabel('Role')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate password' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// The redesigned shell
// ---------------------------------------------------------------------------

const ADMIN_SCREENS = [
  '/admin', '/admin/products', '/admin/orders', '/admin/categories',
  '/admin/users', '/admin/users/new', '/admin/profile', '/admin/enquiries', '/admin/design-pages', '/admin/settings',
  '/admin/media', '/admin/attributes', '/admin/banners', '/admin/gallery',
  '/admin/faqs', '/admin/navigation', '/admin/coupons', '/admin/reviews',
  '/admin/testimonials',
];

test('no admin screen scrolls sideways at this viewport', async ({ page }) => {
  const offenders: string[] = [];

  for (const path of ADMIN_SCREENS) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) offenders.push(`${path} (+${overflow}px)`);
  }

  expect(offenders, offenders.join(', ')).toHaveLength(0);
});

test('the navigation is a rail on desktop and a drawer on a phone', async ({ page }, testInfo) => {
  await page.goto('/admin');

  const nav = page.getByRole('navigation', { name: 'Admin' });
  const openMenu = page.getByRole('button', { name: 'Open menu' });

  if (testInfo.project.name === 'mobile') {
    // The rail would eat half a phone screen, so it hides behind a button.
    await expect(openMenu).toBeVisible();
    await expect(nav).toBeHidden();

    await openMenu.click();
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Products' })).toBeVisible();

    // Choosing something closes it again, rather than leaving it covering the page.
    await nav.getByRole('link', { name: 'Products' }).click();
    await expect(page).toHaveURL(/\/admin\/products/);
    await expect(nav).toBeHidden();
  } else {
    await expect(nav).toBeVisible();
    await expect(openMenu).toBeHidden();
    // Always there, so there is no menu button to reach for.
    await expect(nav.getByRole('link', { name: 'Design Pages' })).toBeVisible();
  }
});

test('body text is big enough to read comfortably', async ({ page }) => {
  await page.goto('/admin/products');
  await page.waitForLoadState('networkidle');

  /*
   * The admin inherited the storefront's display type: 11px capitals at heavy
   * tracking. That is a look, not a reading size, and this screen is read for
   * an hour at a time. Nothing visible should sit below 12px.
   */
  const tooSmall = await page.evaluate(() => {
    const found: string[] = [];
    document.querySelectorAll('main *').forEach((el) => {
      const node = el as HTMLElement;
      if (!node.offsetParent || !node.textContent?.trim()) return;
      // Only leaf elements — a wrapper reports its own inherited size.
      if (node.children.length) return;
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (size && size < 11.5) found.push(`${node.tagName} ${size}px "${node.textContent.trim().slice(0, 25)}"`);
    });
    return found.slice(0, 5);
  });

  expect(tooSmall, tooSmall.join(' | ')).toHaveLength(0);
});
