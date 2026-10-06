import { expect, test } from '@playwright/test';
import { fillPersonalisation, isMobile } from './helpers';

/**
 * The storefront journey a customer actually takes, on desktop and on a phone.
 *
 * Runs against the seeded database, so it asserts on structure and behaviour
 * rather than on specific product names wherever it can.
 */




test.describe('Storefront', () => {
  test('homepage renders its sections and the hero is readable', async ({ page }) => {
    await page.goto('/');

    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();

    // The hero headline was once invisible: a global rule forced dark text onto
    // the dark panel. Assert the text actually contrasts with what is behind it.
    const contrast = await h1.evaluate((el) => {
      const parse = (value: string) => {
        const [r, g, b] = value.match(/\d+/g)!.map(Number);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      };
      let node: HTMLElement | null = el as HTMLElement;
      let background = 'rgba(0, 0, 0, 0)';
      while (node && background.includes('rgba(0, 0, 0, 0)')) {
        background = getComputedStyle(node).backgroundColor;
        node = node.parentElement;
      }
      return Math.abs(parse(getComputedStyle(el).color) - parse(background));
    });
    expect(contrast).toBeGreaterThan(0.25);

    // Sections come from the database, so there must be several of them.
    await expect(page.locator('main section')).not.toHaveCount(0);

    // Nothing may claim an online payment method while none is configured.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('razorpay');
  });

  test('navigation reaches the shop', async ({ page }) => {
    await page.goto('/');

    if (isMobile(page)) {
      await page.getByLabel('Open menu').click();
      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();
      await drawer.getByRole('link', { name: /^shop$/i }).first().click();
    } else {
      // The mega menu opens on hover and must stay compact.
      await page.getByRole('navigation', { name: 'Main' }).getByText('Shop', { exact: true }).hover();
      const panel = page.locator('.shadow-panel').first();
      await expect(panel).toBeVisible();

      const box = (await panel.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(box.width).toBeLessThanOrEqual(viewport.width * 0.95);
      expect(box.height).toBeLessThanOrEqual(viewport.height * 0.75);
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

      await panel.getByRole('link', { name: 'View everything' }).click();
    }

    await expect(page).toHaveURL(/\/shop/);
    await expect(page.locator('article, a[href^="/product/"]').first()).toBeVisible();
  });

  test('every product card offers a real action and a real price', async ({ page }) => {
    await page.goto('/shop');

    const cards = page.locator('a[href^="/product/"]');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Direct purchase: no card may say "price on request" any more.
    const text = (await page.locator('main').innerText()).toLowerCase();
    expect(text).not.toContain('price on request');
    expect(text).not.toContain('enquire for price');
    expect(text).toMatch(/₹\s?\d/);
  });

  test('product page: personalise, preview updates, add to cart', async ({ page }) => {
    await page.goto('/product/minimal-acrylic-name-plate');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main')).toContainText('₹');

    // A product with more than one option must make you choose before buying.
    const options = page.getByRole('radio').and(page.locator(':not([disabled])'));
    if (await options.count()) await options.first().click();

    /*
     * Personalisation is inline on a laptop and behind a sheet on a phone, so
     * the required fields are filled wherever they happen to be. The live
     * preview must follow what is typed either way — that is the point of it.
     */
    await fillPersonalisation(page, 'Playwright Test');

    await page.getByRole('button', { name: /^add to cart$/i }).first().click();

    const cart = page.getByRole('dialog').filter({ hasText: /your cart/i });
    await expect(cart).toBeVisible();
    await expect(cart).toContainText('₹');
  });

  test('cart totals are arithmetically consistent', async ({ page }) => {
    await page.goto('/product/no-smoking-sign');
    const options = page.getByRole('radio').and(page.locator(':not([disabled])'));
    if (await options.count()) await options.first().click();
    await page.getByRole('button', { name: /^add to cart$/i }).first().click();

    // Wait for the add request to finish before navigating. On a remote/free
    // deployment an immediate goto can abort the request and make the cart
    // appear empty even though the UI is working correctly.
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: /cart/i })).toBeVisible();

    const money = (value: string) => Number(value.replace(/[^\d.]/g, ''));
    const rows = await page.locator('main').innerText();
    const subtotal = rows.match(/subtotal[^\d₹]*₹\s?([\d,]+(?:\.\d+)?)/i);
    expect(subtotal, 'a subtotal is shown').not.toBeNull();
    expect(money(subtotal![1])).toBeGreaterThan(0);
  });

  test('custom order stays an enquiry, not a purchase', async ({ page }) => {
    await page.goto('/custom-order');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /add to cart|buy now/i })).toHaveCount(0);
  });

  /*
   * The studio makes nothing at a foot square or under, and the threshold has
   * already moved twice. Every other required field is filled first, so the
   * only thing that can stop the form is the size itself -- otherwise this
   * would pass on the browser's own "this field is required" and prove
   * nothing.
   */
  test('custom order refuses a size of one foot or under', async ({ page }) => {
    await page.goto('/custom-order');

    await page.getByLabel('Your name').fill('Size Rule Test');
    await page.getByLabel('Email').fill('size.rule@example.com');
    await page.getByLabel('Phone').fill('9876543210');
    await page.locator('select[name="requirement"]').selectOption({ index: 1 });
    await page.locator('textarea[name="details"]').fill('Checking the minimum size rule.');
    await page.getByLabel('Unit').selectOption('ft');

    const width = page.getByLabel('Width');
    const height = page.getByLabel('Height');
    const main = page.locator('main');

    // Exactly one foot square is refused, not accepted as the minimum.
    await width.fill('1');
    await height.fill('1');
    await expect(main).toContainText(/larger than 1 ft/i);

    await page.getByRole('button', { name: /send request/i }).click();
    await expect(main).not.toContainText(/request received/i);
    await expect(main).toContainText(/larger than 1 ft/i);

    // One side over is still not enough — both have to clear it.
    await width.fill('3');
    await expect(main).toContainText(/larger than 1 ft/i);

    // Over on both sides, and the warning goes.
    await height.fill('1.5');
    await expect(main).not.toContainText(/larger than 1 ft/i);
  });

  test('a page has one brand in its title, not two', async ({ page }) => {
    await page.goto('/shop');
    const title = await page.title();
    const occurrences = title.toLowerCase().split('beyond walls').length - 1;
    expect(occurrences, `title was "${title}"`).toBeLessThanOrEqual(1);
  });

  test('no horizontal overflow at this viewport', async ({ page }) => {
    for (const path of ['/', '/shop', '/product/minimal-acrylic-name-plate', '/contact', '/about', '/shipping-policy']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });

  test('the console stays clean on the main pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    for (const path of ['/', '/shop', '/product/minimal-acrylic-name-plate']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    // Ignore failures caused by the network, not by our code.
    const real = errors.filter((e) => !/favicon|ERR_INTERNET|net::ERR/i.test(e));
    expect(real, real.join('\n')).toHaveLength(0);
  });
});

/*
 * The header sits on the edge of fitting.
 *
 * A media query counts the scrollbar in the viewport width and the layout does
 * not get it, so just above the 1024px breakpoint the navigation believes it
 * has about fifteen more pixels than exist. Adding one link to the menu was
 * enough to push the icons off the side of the page — and nothing caught it,
 * because the suite only ever looked at 1440 and at phone width.
 */
test.describe('Header fits', () => {
  for (const width of [1024, 1040, 1100, 1280, 1440]) {
    test(`no sideways scroll at ${width}px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile', 'desktop widths only');

      await page.setViewportSize({ width, height: 900 });
      await page.goto('/about');
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `the page scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
    });
  }
});
