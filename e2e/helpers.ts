import { expect, type Page } from '@playwright/test';

/**
 * Shared steps.
 *
 * These live apart from the specs deliberately: importing a helper out of a
 * spec file also imports its tests, so one suite ends up running inside
 * another.
 */

export const isMobile = (page: Page) => page.viewportSize()!.width < 768;

/**
 * Fills the product's required personalisation and checks the live preview
 * follows, wherever the form happens to be at this viewport.
 *
 * On a laptop it is inline beside the photograph. On a phone it is behind a
 * sheet, so that the price and the buy button fit on the first screen.
 */
export async function fillPersonalisation(page: Page, name: string) {
  const sheetTrigger = page.getByRole('button', { name: /personalise/i }).first();
  const opensInSheet = await sheetTrigger.isVisible().catch(() => false);
  if (opensInSheet) await sheetTrigger.click();

  const scope = opensInSheet ? page.getByRole('dialog') : page.locator('#personalise');
  const field = scope.getByLabel('Name', { exact: true });
  const hasNameField = Boolean(await field.count());
  const controls = scope.locator('input[required], textarea[required], select[required]');
  if (!(await controls.count())) return;

  const whatsapp = scope.getByLabel(/WhatsApp contact number/i);
  await expect(whatsapp).toBeVisible();
  await expect(whatsapp).toHaveAttribute('required', '');

  if (hasNameField) await field.fill(name);

  // Every published field is a required part of the production brief. Fill
  // the remaining native controls with valid test values; visual option
  // groups in the seeded product already carry configured defaults.
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible()) || (await control.isDisabled())) continue;

    const tag = await control.evaluate((element) => element.tagName.toLowerCase());
    const type = (await control.getAttribute('type')) ?? '';
    if (type === 'file') continue;
    if (type === 'checkbox') {
      if (!(await control.isChecked())) await control.check();
      continue;
    }
    if (await control.inputValue()) continue;

    if (tag === 'select') {
      const firstValue = await control.locator('option').evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).find(Boolean) ?? '',
      );
      if (firstValue) await control.selectOption(firstValue);
      continue;
    }

    const value = type === 'email'
      ? 'playwright@example.com'
      : type === 'url'
        ? 'https://example.com'
        : type === 'tel'
          ? '9876543210'
          : type === 'number'
            ? '1'
            : type === 'date'
              ? '2026-10-14'
              : 'Playwright details';
    await control.fill(value);
  }

  const preview = scope.locator('svg[aria-label*="preview" i]').first();
  if (hasNameField && await preview.count()) {
    await expect(preview).toContainText(new RegExp(name, 'i'));
  }

  if (opensInSheet) {
    const done = scope.getByRole('button', { name: /^done$/i });
    await expect(done).toBeVisible();
    const box = await done.boundingBox();
    if (!box) throw new Error('Personalisation Done button has no clickable area');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(scope).toBeHidden();
  }
}
