import { expect, test } from '@playwright/test';
import { fillPersonalisation, isMobile } from './helpers';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api';

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

      // The drawer separates browsing from errands, so Shop is a tab and not a
      // destination; it opens on that tab and the way through is the collections.
      await expect(drawer.getByRole('tab', { name: 'Shop' })).toHaveAttribute('aria-selected', 'true');
      await drawer.getByRole('link', { name: 'View everything' }).click();
    } else {
      // The mega menu opens on hover and must stay compact.
      await page.getByRole('navigation', { name: 'Main' }).getByText('Shop', { exact: true }).hover();
      const panel = page.locator('.shadow-panel').first();
      await expect(panel).toBeVisible();

      /*
       * The panel is a band across the header now, not a box floating under
       * the Shop link, so it is meant to be the full width. What still has to
       * hold is that it spans the viewport exactly -- a band one pixel wider
       * than the page is a horizontal scrollbar on every screen -- and that it
       * does not grow so tall it swallows the page behind it.
       */
      const box = (await panel.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(Math.round(box.width)).toBe(viewport.width);
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.height).toBeLessThanOrEqual(viewport.height * 0.8);

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'an open menu must not widen the page').toBeLessThanOrEqual(1);

      await panel.getByRole('link', { name: 'View everything' }).click();
    }

    await expect(page).toHaveURL(/\/shop/);
    await expect(page.locator('article, a[href^="/product/"]').first()).toBeVisible();
  });

  test('the phone drawer keeps the collections apart from the pages', async ({ page }) => {
    /*
     * The studio asked for the phone header to be redone "for categories and
     * pages". They were two halves of one scroll: Contact and Track an order
     * sat below every collection and every filter group, which is a long way
     * down for an errand that takes one tap on a laptop.
     */
    test.skip(!isMobile(page), 'the drawer is the phone header');

    await page.goto('/');
    await page.getByLabel('Open menu').click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // Browsing is what the drawer opens on.
    const shopTab = drawer.getByRole('tab', { name: 'Shop' });
    const pagesTab = drawer.getByRole('tab', { name: 'Pages' });
    await expect(shopTab).toHaveAttribute('aria-selected', 'true');
    await expect(pagesTab).toHaveAttribute('aria-selected', 'false');

    // The collections are shown as pictures, so each one is a link with a tile.
    const shopPanel = drawer.locator('#mobile-shop');
    await expect(shopPanel.locator('a[href^="/shop/"]').first()).toBeVisible();
    await expect(shopPanel).toContainText(/custom order/i);

    // The errands are one tap away, not one scroll.
    await pagesTab.click();
    await expect(pagesTab).toHaveAttribute('aria-selected', 'true');
    const pagesPanel = drawer.locator('#mobile-pages');
    await expect(pagesPanel).toBeVisible();
    await expect(pagesPanel.getByRole('link').first()).toBeVisible();

    // And the two halves stay apart: no collection tiles under Pages.
    await expect(pagesPanel.locator('a[href^="/shop/"]')).toHaveCount(0);
  });

  test('the footer opens its columns on a laptop and folds them on a phone', async ({ page }) => {
    /*
     * Four columns side by side cost nothing on a laptop. Stacked on a phone
     * they put the address and the opening hours a long scroll below the fold,
     * so there the headings fold. The headings are buttons at every width --
     * only the behaviour changes -- so this checks what the reader can see
     * rather than what the markup says.
     */
    await page.goto('/');
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();

    const studio = footer.getByRole('button', { name: /^studio$/i });
    await expect(studio).toBeVisible();
    const trackOrder = footer.getByRole('link', { name: /track an order/i });

    if (isMobile(page)) {
      await expect(trackOrder).toBeHidden();
      await studio.click();
      await expect(trackOrder).toBeVisible();
    } else {
      // Open already, and pressing the heading must not close it.
      await expect(trackOrder).toBeVisible();
      await studio.click({ force: true });
      await expect(trackOrder).toBeVisible();
    }

    // The way back into the shop belongs at the foot of a page that was read
    // to the end.
    await expect(footer.locator('a[href^="/shop/"]').first()).toBeAttached();
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

  /*
   * The choices on a product are rows in the database, not code, so a deploy
   * carries none of them. Twice now the studio has asked for a change here --
   * "remove this optional logo section", and their own fonts and colours -- and
   * seen it on one site and not the other, because only the first database was
   * touched. This reads the product the storefront reads, so pointing
   * E2E_API_URL at a deployment says whether that deployment actually has them.
   */
  test('the product offers the personalisation the studio asked for', async ({ request }) => {
    const response = await request.get(API + '/catalog/products/minimal-acrylic-name-plate');
    expect(response.ok(), 'the product is published').toBeTruthy();

    const fields = (await response.json()).data.personalization as Array<{
      key: string;
      type: string;
      options: Array<{ value: string; hex?: string }>;
    }>;

    // The logo upload they asked us to take off the product page.
    expect(fields.map((f) => f.key)).not.toContain('logoUpload');
    expect(fields.map((f) => f.type)).not.toContain('IMAGE_UPLOAD');

    const choices = (key: string) =>
      (fields.find((f) => f.key === key)?.options ?? []).map((o) => o.value);

    // Every face the preview can draw, per PLATE_FONTS in LivePreview.tsx. A
    // value missing here is a face the customer cannot pick; a value the
    // renderer does not know falls back to the default without saying so.
    const drawable = ['grotesque', 'display', 'serif', 'condensed', 'mono', 'script'];
    expect(choices('font')).toEqual(expect.arrayContaining(drawable));
    for (const value of choices('font')) expect(drawable).toContain(value);

    expect(choices('plateColour')).toEqual(
      expect.arrayContaining(['black', 'white', 'brass', 'steel']),
    );
    expect(choices('textColour')).toEqual(
      expect.arrayContaining(['white', 'black', 'brass', 'blue']),
    );

    // The preview paints opt.hex, falling back to the bare value. Without a hex
    // a swatch is only as good as the name happening to be a CSS colour, and
    // "brass" is not one.
    for (const key of ['plateColour', 'textColour']) {
      const options = fields.find((f) => f.key === key)!.options;
      for (const option of options) {
        expect(option.hex, key + ' option "' + option.value + '" carries a hex').toMatch(
          /^#[0-9a-fA-F]{6}$/,
        );
      }
    }
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
