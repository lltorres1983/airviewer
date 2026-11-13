import { test, expect } from '@playwright/test';
import { fixtures } from './fixtures';
const traffic = Array.from({ length: 6 }, (_, i) => ({ hex: `abc12${i}`, flight: `TAM123${i}`, r: `PT-AB${i}`, t: 'A320', lat: -23.461107-i*.003, lon: -46.582583-i*.012, alt_baro: 5000+i*100, track: 74, baro_rate: -500, gs: 160, seen_pos: 1 }));

test('fila visual abre no lugar de movimentos, seleciona voo e preserva torre', async ({ page }) => {
  test.setTimeout(60000); await fixtures(page, traffic); await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const dock = page.getByRole('complementary', { name: 'Torre e spotting do aeroporto' });
  await expect(dock.getByRole('heading', { name: 'Fila de aproximação · GRU' })).toBeVisible();
  await expect(dock.locator('.visual-approach-flight')).toHaveCount(6);
  await expect(page.locator('#schedule-list')).not.toBeVisible();
  await dock.getByLabel('Pista da torre compacta').selectOption('10L/28R');
  await expect(page.locator('html')).toHaveAttribute('data-airport-view', 'tower');
  await dock.getByRole('button', { name: 'Acompanhar TAM1230', exact: true }).click();
  await expect(page.locator('.aircraft-details-header')).toContainText('TAM1230');
  await expect(page.locator('html')).toHaveAttribute('data-airport-view', 'tower');
  await page.getByRole('button', { name: 'Fechar detalhes da aeronave' }).click();
  await dock.screenshot({ path: 'test-results/tower-queue-desktop.png' });
  await dock.getByRole('button', { name: 'Mais', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Torre e spotting', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar torre e spotting' }).click();
  await dock.locator('.tower-other-movements > summary').click();
  await expect(page.locator('#schedule-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('fila móvel troca aeroporto e volta ao mapa ao selecionar', async ({ page }) => {
  await fixtures(page, traffic); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.locator('#mobile-menu-toggle').click(); await page.getByRole('button', { name: 'Fila de aproximação', exact: true }).click();
  const dock = page.getByRole('complementary', { name: 'Torre e spotting do aeroporto' });
  await expect(dock.locator('.visual-approach-flight')).toHaveCount(6);
  expect(await dock.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await dock.screenshot({ path: 'test-results/tower-queue-mobile.png' });
  await dock.getByRole('button', { name: 'Acompanhar TAM1230', exact: true }).click();
  await expect(page.locator('#mobile-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Fechar detalhes da aeronave' }).click();
  await page.locator('#mobile-menu-toggle').click(); await page.getByRole('button', { name: 'Fila de aproximação', exact: true }).click();
  await page.locator('#mobile-menu-toggle').click();
  await page.locator('#airport-select').selectOption('GIG');
  await page.getByRole('button', { name: 'Fila de aproximação', exact: true }).click();
  await expect(dock.locator('h2')).toContainText('GIG');
  await expect(dock.locator('.visual-approach-flight')).toHaveCount(0);
  await expect(dock).toContainText('Nenhuma aproximação identificada');
});

test('fila segue o seletor principal em GRU, SDU e GIG, sem misturar voos', async ({ page }) => {
  await fixtures(page, [
    { ...traffic[0], flight: 'GRU1000' },
    { ...traffic[0], hex: 'abc777', flight: 'SDU2000', lat: -22.94, lon: -43.1627, track: 358, alt_baro: 1500 },
    { ...traffic[0], hex: 'abc888', flight: 'GIG3000', lat: -22.82, lon: -43.34, track: 77, alt_baro: 2000 },
  ]);
  await page.goto('/');
  const dock = page.getByRole('complementary', { name: 'Torre e spotting do aeroporto' });
  for (const [code, flight] of [['GRU', 'GRU1000'], ['SDU', 'SDU2000'], ['GIG', 'GIG3000']]) {
    await page.locator('#airport-select').selectOption(code);
    await expect(dock.getByRole('heading', { name: `Fila de aproximação · ${code}` })).toBeVisible();
    await expect(dock.locator('.visual-approach-flight')).toHaveCount(1);
    await expect(dock.locator('.visual-approach-flight')).toContainText(flight);
    if (code === 'SDU') {
      await dock.getByLabel('Pista da torre compacta').selectOption('02L/20R');
      await expect(page.locator('html')).toHaveAttribute('data-airport-view', 'tower');
    }
  }
});
