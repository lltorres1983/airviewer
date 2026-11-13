import { test, expect } from '@playwright/test';
import { fixtures } from './fixtures';

test('camadas opcionais e menu compacto em tela inteira', async ({ page }) => {
  test.setTimeout(90000);
  await fixtures(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(page.locator('#fullscreen')).toHaveText('Sair da tela inteira');
  await expect(page.locator('#refresh-interval')).toBeHidden();
  await page.getByText('Mais controles', { exact: true }).click();
  await expect(page.locator('#refresh-interval')).toBeVisible();
  await page.getByText('Mais controles', { exact: true }).click();
  await page.locator('.explore-controls summary').click();
  await page.locator('#explore-rain').check();
  await expect(page.locator('#explore-rain-status')).toContainText('Composição às');
  await expect(page.locator('#map')).toHaveAttribute('data-rain', 'true');
  await page.locator('#explore-cloud').check();
  await expect(page.locator('#map')).toHaveAttribute('data-cloud', 'true');
  await page.screenshot({ path: 'test-results/explore-fullscreen.png' });
  await page.locator('#explore-rain').uncheck();
  await expect(page.locator('#map')).toHaveAttribute('data-rain', 'false');
  await page.keyboard.press('Escape');
  await expect(page.locator('.explore-menu')).toBeHidden();
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await expect(page.locator('#refresh-interval')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-menu-toggle').click();
  await page.locator('.explore-controls summary').click();
  await expect(page.locator('#explore-cloud')).toBeChecked();
  expect(await page.locator('.explore-menu').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/explore-mobile.png' });
});

test('falha meteorológica permite tentar novamente sem perder os controles', async ({ page }) => {
  await fixtures(page);
  let failed = true;
  await page.route('https://api.rainviewer.com/**', route => failed ? route.fulfill({ status: 503, body: '' }) : route.fulfill({ json: { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: Math.floor(Date.now() / 1000), path: '/v2/radar/test-frame' }] } } }));
  await page.goto('/');
  await page.locator('.explore-controls summary').click();
  await page.locator('#explore-rain').check();
  await expect(page.locator('#explore-rain-status')).toContainText('indisponível');
  await expect(page.locator('#map')).toHaveAttribute('data-rain', 'false');
  failed = false;
  await page.locator('#explore-refresh').click();
  await expect(page.locator('#map')).toHaveAttribute('data-rain', 'true');
});

test('relevo usa elevação real e pode ser desligado sem remover as outras camadas', async ({ page }) => {
  test.setTimeout(60000);
  await fixtures(page);
  // Sample Mapzen Terrarium elevation tile; attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/**', route => route.fulfill({ path: 'tests/assets/terrain.png', contentType: 'image/png' }));
  await page.goto('/');
  await page.locator('.explore-controls summary').click();
  const demRequest = page.waitForRequest('https://s3.amazonaws.com/elevation-tiles-prod/**');
  await page.locator('#explore-terrain').check();
  await demRequest;
  await expect(page.locator('#map')).toHaveAttribute('data-terrain', 'true');
  await page.locator('#explore-rain').check();
  await expect(page.locator('#map')).toHaveAttribute('data-rain', 'true');
  await page.locator('#explore-terrain').uncheck();
  await expect(page.locator('#map')).toHaveAttribute('data-terrain', 'false');
  await expect(page.locator('#map')).toHaveAttribute('data-rain', 'true');
});

test('relevo indisponível pode ser reativado', async ({ page }) => {
  test.setTimeout(60000);
  await fixtures(page);
  let failed = true;
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/**', route => failed
    ? route.fulfill({ status: 503, body: '' })
    : route.fulfill({ path: 'tests/assets/terrain.png', contentType: 'image/png' }));
  await page.goto('/');
  await page.locator('.explore-controls summary').click();
  await page.locator('#explore-terrain').check();
  await expect(page.locator('#explore-terrain-status')).toContainText('indisponível');
  await expect(page.locator('#map')).toHaveAttribute('data-terrain', 'false');
  failed = false;
  await page.locator('#explore-terrain').uncheck();
  await page.locator('#explore-terrain').check();
  await expect(page.locator('#map')).toHaveAttribute('data-terrain', 'true');
  await expect(page.locator('#explore-terrain-status')).toContainText('escala real');
});
