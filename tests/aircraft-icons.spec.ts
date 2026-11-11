import { test, expect } from '@playwright/test';
import { aircraftIconKind } from '../web/src/lib/aircraft-icons';
import { fixtures } from './fixtures';

test('classifica modelos ICAO e mantém padrão para modelos desconhecidos', () => {
  for (const [model, kind] of Object.entries({
    A20N: 'airliner', B738: 'airliner', B77W: 'heavy', A388: 'heavy',
    E295: 'regional', C25B: 'business', AT76: 'turboprop', C172: 'light',
    AS50: 'helicopter', R44: 'helicopter', ' at72 ': 'turboprop',
    B999: 'generic', '': 'generic', A320XYZ: 'generic',
  })) expect(aircraftIconKind(model), model).toBe(kind);
});

test('seleção troca a silhueta entre helicóptero, avião pesado e modelo desconhecido', async ({ page }) => {
  test.setTimeout(60000); // Three map selections with software WebGL in CI.
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await fixtures(page, ['AS50', 'B77W', 'ZZZZ'].map((t, i) => ({
    hex: `abc12${i}`, flight: `TEST${i}`, r: `PT-AA${i}`, t,
    lat: -23.4356 + i * .005, lon: -46.4731, alt_baro: 5000,
    track: 120, baro_rate: -500, gs: 180, seen_pos: 1,
  })));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await page.locator('#live-tab').click();
  const icons = [];
  for (const [i, kind] of ['helicopter', 'heavy', 'generic'].entries()) {
    await page.locator('.arrival-row').filter({hasText:`TEST${i}`}).click();
    const marker = page.locator('.aircraft-marker');
    await expect(marker).toHaveAttribute('data-aircraft-kind', kind);
    icons.push(await marker.locator('.aircraft-symbol').evaluate(el => getComputedStyle(el).backgroundImage));
  }
  expect(new Set(icons).size).toBe(3);
  expect(errors).toEqual([]);
  await expect(page.locator('#diagnostics-text')).not.toContainText('Camadas 3D');
});
