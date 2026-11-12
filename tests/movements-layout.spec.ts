import { test, expect } from '@playwright/test';
import { fixtures } from './fixtures';

test('painel acompanha poucos voos e permite restaurar altura automática', async ({ page }) => {
  await fixtures(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const panel = page.locator('#arrivals-panel');
  await expect(page.locator('.schedule-row')).toHaveCount(1);
  expect((await panel.boundingBox())!.height).toBeLessThan(250);
  await page.getByRole('button', { name: 'Redimensionar movimentos', exact: true }).focus();
  await page.keyboard.press('Shift+ArrowDown');
  const expanded = (await panel.boundingBox())!.height;
  await page.getByRole('button', { name: 'Ajustar altura dos movimentos ao conteúdo' }).click();
  expect((await panel.boundingBox())!.height).toBeLessThan(expanded);
  expect(await page.evaluate(() => localStorage.getItem('airviewer-movements-height'))).toBeNull();
  await panel.screenshot({ path: 'test-results/movements-compact.png' });
});

test('lista preenche painel ampliado nas duas abas sem limite de 190 pixels', async ({ page }) => {
  await fixtures(page, Array.from({ length: 24 }, (_, i) => ({ hex: `abc${i.toString(16).padStart(3, '0')}`, flight: `TAM${1000+i}`, lat: -23.43, lon: -46.47, alt_baro: 5000, track: 120, gs: 180, seen_pos: 1 })));
  await page.route('**/schedule.json', route => route.fulfill({ json: { start: Date.now()-60000, end: Date.now()+86400000, airports: { GRU: Array.from({ length: 24 }, (_, i) => ({ flight: `TAM${1000+i}`, direction: 'arrival', time: Date.now()+600000+i*1000, airport: 'GIG' })), GIG: [], SDU: [] } } }));
  await page.addInitScript(() => localStorage.setItem('airviewer-movements-height', '560'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  for (const tab of ['schedule', 'live']) {
    await page.locator(`#${tab}-tab`).click();
    const list = page.locator(tab === 'schedule' ? '#schedule-list' : '#arrivals-list');
    await expect(list.locator('button').first()).toBeVisible();
    const geometry = await list.evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight, gap: el.parentElement!.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom, footer: el.nextElementSibling?.getBoundingClientRect().height || 0 }));
    expect(geometry.height).toBeGreaterThan(300);
    expect(geometry.content).toBeGreaterThan(geometry.height);
    expect(Math.abs(geometry.gap - geometry.footer)).toBeLessThan(2);
  }
  await page.locator('#arrivals-panel').screenshot({ path: 'test-results/movements-expanded.png' });
});
