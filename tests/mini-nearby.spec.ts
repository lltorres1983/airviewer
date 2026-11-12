import { test, expect } from '@playwright/test';
import { fixtures } from './fixtures';

test('radar compacto só consulta posição ao ativar e transfere localização ao dashboard', async ({ page }) => {
  test.setTimeout(90000);
  await fixtures(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: -23.4356, longitude: -46.4731, accuracy: 10 });
  let requests = 0;
  page.on('request', r => { if(r.url().includes('/point/-23.43560/-46.47310/11')) requests++; });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const mini = page.getByRole('region', { name: 'Radar compacto perto de mim' });
  await expect(mini).toBeVisible();
  await expect(mini.locator('canvas')).toHaveCount(0); expect(requests).toBe(0);
  await mini.getByRole('button', { name: 'Ativar radar local' }).click();
  await expect(mini).toContainText('1 aeronave', { timeout: 15000 });
  await expect(mini.locator('.weather-traffic-map')).toHaveAttribute('data-rain', 'true');
  await page.screenshot({ path: 'test-results/mini-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(mini).toBeVisible();
  expect(await mini.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/mini-mobile.png' });
  await mini.getByRole('button', { name: 'Recolher radar compacto' }).click();
  await expect(mini.locator('canvas')).toHaveCount(0);
  await mini.getByRole('button', { name: 'Expandir radar compacto' }).click();
  await mini.getByRole('button', { name: 'Abrir completo' }).click();
  const dashboard = page.getByRole('dialog', { name: 'Radar perto de mim', exact: true });
  await expect(dashboard.getByRole('button', { name: 'Atualizar minha localização' })).toBeVisible();
  await expect(dashboard.locator('.nearby-flights')).toContainText('TAM1234', { timeout: 15000 });
  await dashboard.getByRole('button', { name: 'Fechar radar perto de mim' }).click();
  await expect(mini).toBeVisible(); expect(errors).toEqual([]);
});

test('localização negada no radar compacto mantém ação para tentar novamente', async ({ page }) => {
  await fixtures(page);
  await page.addInitScript(() => Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { value: (_ok: unknown, error: (e: { code: number }) => void) => error({ code: 1 }) }));
  await page.goto('/');
  const mini = page.getByRole('region', { name: 'Radar compacto perto de mim' });
  await mini.getByRole('button', { name: 'Ativar radar local' }).click();
  await expect(mini.getByRole('alert')).toContainText('Acesso à localização negado');
  await expect(mini.locator('canvas')).toHaveCount(0);
  await expect(mini.getByRole('button', { name: 'Ativar radar local' })).toBeEnabled();
});
