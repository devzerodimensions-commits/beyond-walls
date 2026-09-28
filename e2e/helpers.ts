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
  if (!(await field.count())) return;

  await field.fill(name);

  const preview = scope.locator('svg[aria-label*="preview" i]').first();
  if (await preview.count()) {
    await expect(preview).toContainText(new RegExp(name, 'i'));
  }

  if (opensInSheet) {
    await scope.getByRole('button', { name: /^done$/i }).click();
    await expect(scope).toBeHidden();
  }
}
