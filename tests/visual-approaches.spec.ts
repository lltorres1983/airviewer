import { test, expect } from '@playwright/test';
import { fixtures } from './fixtures';

test('fila visual ordena aeronaves e permanece legível no celular', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixtures(page, [3, 1, 2].map(i => ({ hex: `abc12${i}`, flight: `TAM${i}000`, r: `PT-AB${i}`, t: 'A320',
    lon: -46.482548 - .033345 * i, lat: -23.434059 - .009016 * i, alt_baro: 4000 + i * 500, track: 74, baro_rate: -500, gs: 160, seen_pos: 1 })));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Torre e spotting', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Torre e spotting' });
  const queue = panel.getByRole('list', { name: 'Fila visual de aproximação GRU' });
  await expect(queue.getByRole('listitem')).toHaveCount(3);
  await expect(queue.getByRole('listitem').first()).toContainText('TAM1000');
  await expect(queue.getByRole('listitem').nth(2)).toContainText('TAM3000');
  await expect(queue.getByRole('listitem').first()).toContainText('Pista provável 10L');
  await expect(queue.getByRole('listitem').first()).toContainText('~1 min');
  await expect(panel).toContainText('Diagrama sem escala');
  await panel.locator('.visual-approaches').screenshot({ path: 'test-results/approaches-desktop.png' });
  await page.getByRole('button', { name: 'Fechar torre e spotting' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-menu-toggle').click();
  await page.getByRole('button', { name: 'Torre e spotting', exact: true }).click();
  await expect(queue.getByRole('listitem')).toHaveCount(3);
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await panel.locator('.visual-approaches').screenshot({ path: 'test-results/approaches-mobile.png' });
  await queue.getByRole('button', { name: 'Acompanhar TAM2000', exact: true }).click();
  await expect(page.locator('#diagnostics-text')).not.toContainText('Camadas 3D');
  expect(errors).toEqual([]);
});
