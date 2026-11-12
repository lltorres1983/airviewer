import { test, expect, type Page } from '@playwright/test';
import { fixtures } from './fixtures';
import type { HomeRadar } from '../web/src/lib/database.types';

const userId = '11111111-1111-4111-8111-111111111111';
const host = 'https://airviewer-test.supabase.co';
const savedHome: HomeRadar = { user_id: userId, address: 'Local fictício para testes', latitude: -23.4356, longitude: -46.4731, radius_km: 20, updated_at: new Date().toISOString() };
async function setup(page: Page, initial: HomeRadar | null = null) {
  await fixtures(page, [
    { hex: 'abc123', flight: 'NEAR123', t: 'A320', lat: -23.43, lon: -46.47, alt_baro: 35000, track: 210, gs: 350, seen_pos: 1 },
    { hex: 'abc124', flight: 'FAR123', t: 'A320', lat: -23.43, lon: -45.47, alt_baro: 10000, track: 210, gs: 250, seen_pos: 1 },
    { hex: 'abc125', flight: 'HELI123', t: 'R44', lat: -23.432, lon: -46.47, alt_baro: 3000, track: 210, gs: 40, seen_pos: 1 },
  ]);
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const session = { access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: expires })}.dGVzdA`,
    refresh_token: 'test', token_type: 'bearer', expires_at: expires, expires_in: 3600,
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'radar@example.test', app_metadata: { provider: 'google' }, user_metadata: {}, created_at: new Date().toISOString() } };
  await page.addInitScript(session => {
    if (!sessionStorage.getItem('radar-seeded')) {
      localStorage.setItem('sb-airviewer-test-auth-token', JSON.stringify(session));
      sessionStorage.setItem('radar-seeded', 'true');
    }
  }, session);
  await page.route(`${host}/rest/v1/aircraft_favorites**`, route => route.fulfill({ json: [] }));
  await page.route(`${host}/auth/v1/logout**`, route => route.fulfill({ status: 204 }));
  await page.route(`${host}/auth/v1/user`, route => route.fulfill({ json: session.user }));
  const db = { row: initial, fail: false, writes: 0 };
  await page.route(`${host}/rest/v1/home_radar**`, route => {
    const method = route.request().method();
    if (db.fail) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    if (method === 'GET') return route.fulfill({ json: db.row });
    if (method === 'POST') { db.writes++; db.row = route.request().postDataJSON(); return route.fulfill({ status: 201, json: db.row }); }
    if (method === 'DELETE') { db.row = null; return route.fulfill({ status: 204 }); }
    return route.fulfill({ status: 405 });
  });
  return db;
}

async function openAccount(page: Page) {
  await page.getByRole('button', { name: 'Conta e favoritos', exact: true }).click();
  await expect(page.locator('#home-address')).toBeVisible();
}

test('salva casa na conta, recarrega, filtra tráfego, ativa 3D e limpa ao sair', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const db = await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await openAccount(page);
  await page.locator('#home-address').fill(savedHome.address);
  await page.getByLabel('Latitude da casa').fill(String(savedHome.latitude));
  await page.getByLabel('Longitude da casa').fill(String(savedHome.longitude));
  await page.getByRole('button', { name: 'Salvar localização', exact: true }).click();
  await expect(page.getByText('Localização salva na sua conta.', { exact: false })).toBeVisible();
  expect(db.row?.user_id).toBe(userId);
  expect(db.writes).toBe(1);
  await page.reload();
  await openAccount(page);
  await expect(page.locator('#home-address')).toHaveValue(savedHome.address);
  const request = page.waitForRequest(req => req.url().includes(`/point/${savedHome.latitude}/${savedHome.longitude}/${20 / 1.852}`));
  await page.getByRole('button', { name: 'Abrir radar 3D' }).click();
  await request;
  await expect(page.locator('.home-radar-marker')).toHaveText('Minha casa');
  await expect(page.locator('#route')).toContainText('RADAR DA MINHA CASA');
  await expect(page.locator('#arrivals-list')).toContainText('NEAR123');
  await expect(page.locator('#arrivals-list')).toContainText('HELI123');
  await expect(page.locator('#arrivals-list')).not.toContainText('FAR123');
  await expect(page.locator('#arrivals-list')).toContainText('Se aproximando');
  await expect(page.locator('#schedule-tab')).toBeHidden();
  await expect(page.locator('#airport-camera')).toBeHidden();
  await page.screenshot({ path: 'test-results/home-radar-desktop.png' });
  await page.getByRole('button', { name: 'Acompanhar NEAR123' }).click();
  await expect(page.locator('.aircraft-marker')).toBeVisible();
  await expect(page.locator('.home-radar-marker')).toBeVisible();
  await openAccount(page);
  await page.locator('#home-radius').selectOption('5');
  const smallerRegion = page.waitForRequest(req => req.url().includes(`/point/${savedHome.latitude}/${savedHome.longitude}/${5 / 1.852}`));
  await page.getByRole('button', { name: 'Salvar localização', exact: true }).click();
  await smallerRegion;
  await expect(page.locator('#route')).toContainText('5 km');
  expect(db.row?.radius_km).toBe(5);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.locator('.home-radar-marker')).toHaveCount(0);
  await expect(page.locator('#home-address')).toHaveCount(0);
  expect(db.row?.address).toBe(savedHome.address);
  expect(errors).toEqual([]);
});

test('falha de gravação não confirma sucesso e exclusão remove a casa', async ({ page }) => {
  const db = await setup(page, savedHome);
  await page.goto('/');
  await openAccount(page);
  db.fail = true;
  await page.locator('#home-address').fill('Outro endereço de teste');
  await page.getByRole('button', { name: 'Salvar localização', exact: true }).click();
  await expect(page.getByText('Não foi possível salvar sua localização.', { exact: false })).toBeVisible();
  expect(db.row?.address).toBe(savedHome.address);
  db.fail = false;
  await page.getByRole('button', { name: 'Excluir localização' }).click();
  await expect(page.getByText('Localização excluída da sua conta.')).toBeVisible();
  expect(db.row).toBeNull();
  await expect(page.locator('#home-address')).toHaveValue('');
});

test('radar funciona no celular e volta ao aeroporto ao desativar', async ({ page }) => {
  await setup(page, savedHome);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Conta', exact: true }).click();
  await expect(page.locator('#home-address')).toHaveValue(savedHome.address);
  await page.locator('.account-panel').screenshot({ path: 'test-results/home-radar-settings-mobile.png' });
  await page.getByRole('button', { name: 'Abrir radar 3D' }).click();
  await expect(page.locator('.home-radar-marker')).toBeVisible();
  await page.locator('#mobile-menu-toggle').click();
  await page.getByRole('button', { name: 'Sair do radar de casa' }).click();
  await expect(page.locator('.home-radar-marker')).toHaveCount(0);
  await expect(page.locator('#route')).toHaveText('TRAFEGO GRU');
});
