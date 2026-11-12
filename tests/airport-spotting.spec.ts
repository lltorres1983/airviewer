import { test, expect } from '@playwright/test';
import { fixtures } from './fixtures';

test('torre fixa, fila estimada, meteorologia e alertas em GRU e GIG', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await fixtures(page, [{ hex: 'abc123', flight: 'TAM1234', r: 'PT-ABC', t: 'A388',
    lat: -23.461107, lon: -46.582583, alt_baro: 5000, track: 74, baro_rate: -500, gs: 160, seen_pos: 1 }]);
  const now = Math.floor(Date.now() / 1000);
  await page.route('**/weather.json', route => route.fulfill({ json: { generatedAt: new Date().toISOString(),
    metars: [{ icaoId: 'SBGR', obsTime: now, rawOb: 'METAR SBGR 121000Z 09010KT CAVOK 23/20 Q1018', wdir: 90, wspd: 10, visib: '6+', temp: 23, altim: 1018, clouds: [] },
      { icaoId: 'SBGL', obsTime: now - 7200, rawOb: 'METAR SBGL 120800Z 18005KT 9999 FEW030 25/20 Q1015', wdir: 180, wspd: 5, visib: '6+', clouds: [{ cover: 'FEW', base: 3000 }] }],
    tafs: [{ icaoId: 'SBGR', issueTime: new Date().toISOString(), validTimeFrom: now, validTimeTo: now + 86400, rawTAF: 'TAF SBGR TEST', fcsts: [{ timeFrom: now, timeTo: now + 3600, wspd: 12, wdir: 100, visib: '6+', clouds: [{ cover: 'BKN', base: 3000 }] }] }] } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Torre e spotting', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Torre e spotting' });
  await expect(panel.locator('.approach-queue')).toContainText('TAM1234');
  await expect(panel.locator('.approach-queue')).toContainText('Pista provável 10L');
  await expect(panel).toContainText('Vento de 90°, 10 nós');
  await panel.getByText('Previsão TAF ·', { exact: false }).click();
  await expect(panel).toContainText('Muito nublado');
  await page.locator('#tower-runway').selectOption('10L/28R');
  await expect(page.locator('html')).toHaveAttribute('data-airport-view', 'tower');
  await expect(page.locator('#recenter')).toHaveText('Recentrar torre');
  await expect(page.locator('#zoom-control')).toHaveValue('14.5');
  await expect(page.locator('#cardinal-value')).toHaveText('S 164°');
  const heading = await page.locator('#cardinal-value').textContent();
  await panel.locator('.approach-queue button').click();
  await expect(page.locator('html')).toHaveAttribute('data-airport-view', 'tower');
  await expect(page.locator('#zoom-control')).toHaveValue('14.5');
  await expect(page.locator('#cardinal-value')).toHaveText(heading!);
  await page.locator('#spotting-models').fill('A388');
  await page.getByLabel('Ativar alertas de spotting').check();
  await expect(panel.locator('.spotting-alerts li')).toHaveCount(1);
  await panel.evaluate(element => { element.scrollTop = 0; });
  await panel.screenshot({ path: 'test-results/spotting-desktop.png' });
  await page.getByRole('button', { name: 'Fechar torre e spotting' }).click();
  await expect(page.locator('.spotting-notice')).toContainText('PT-ABC');
  await page.screenshot({ path: 'test-results/tower-desktop.png' });
  await page.getByRole('button', { name: /Torre e spotting/ }).click();
  await page.getByRole('button', { name: 'GIG · Galeão', exact: true }).click();
  await expect(page.locator('#airport-select')).toHaveValue('GIG');
  await expect(page.locator('html')).toHaveAttribute('data-airport-view', 'panorama');
  await expect(panel).toContainText('Observação desatualizada');
  await page.locator('#tower-runway').selectOption('15/33');
  await expect(page.locator('html')).toHaveAttribute('data-airport-view', 'tower');
  await page.getByRole('button', { name: 'Fechar torre e spotting' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-menu-toggle').click();
  await page.getByRole('button', { name: /Torre e spotting/ }).click();
  await expect(panel).toBeVisible();
  await panel.screenshot({ path: 'test-results/spotting-mobile.png' });
  await expect(page.locator('#diagnostics-text')).not.toContainText('Camadas 3D');
  expect(errors).toEqual([]);
});

test('meteorologia indisponível pode ser atualizada sem inventar condições', async ({ page }) => {
  await fixtures(page);
  let failing = true;
  await page.route('**/weather.json', route => failing ? route.fulfill({ status: 503 }) : route.fulfill({ json: { generatedAt: new Date().toISOString(), metars: [], tafs: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Torre e spotting', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível atualizar a meteorologia');
  failing = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('METAR indisponível');
});
