import { expect, test, type Locator, type Page } from '@playwright/test';

/** Visual evidence only. Behavioral assertions remain in each scenario. */
export async function capture(
  target: Page | Locator,
  name: string,
  options: { fullPage?: boolean; animations?: 'disabled' | 'allow' } = {},
) {
  const page = 'page' in target ? target.page() : target;
  await expect(page.locator('#root')).toBeVisible();
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(
    page.locator('[data-care-boot-state="loading"], [data-care-boot-state="failed"]'),
  ).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images)
        .filter((image) => image.getBoundingClientRect().width > 0 && image.loading !== 'lazy')
        .map(async (image) => {
          await image.decode();
        }),
    );
  });
  const path = test.info().outputPath(name);
  await target.screenshot({ ...options, animations: 'disabled', path });
  await test.info().attach(`capture:${name}`, { path, contentType: 'image/png' });
  await test.info().attach(`capture-meta:${name}`, {
    body: JSON.stringify({
      viewport: page.viewportSize(),
      browserVersion: page.context().browser()?.version(),
    }),
    contentType: 'application/json',
  });
}
