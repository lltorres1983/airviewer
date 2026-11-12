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
  const db = { row: initial, fail: false, writes: 0, tableMissing: false, profileFail: false,
    profileHome: null as Omit<HomeRadar, 'user_id'> | null, profileWrites: 0, profileAuthorization: '' };
  await page.route(`${host}/auth/v1/user`, route => {
    if (route.request().method() === 'PUT') {
      if (db.profileFail) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      db.profileWrites++;
      db.profileAuthorization = route.request().headers().authorization;
      db.profileHome = route.request().postDataJSON().data.home_radar;
    }
    return route.fulfill({ json: { ...session.user, user_metadata: { home_radar: db.profileHome, full_name: 'Usuário de teste' } } });
  });
  await page.route(`${host}/rest/v1/home_radar**`, route => {
    const method = route.request().method();
    if (db.tableMissing) return route.fulfill({ status: 404, json: { code: 'PGRST205', message: 'Table missing' } });
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


test('salva a localização obtida no perfil quando a tabela ainda não existe', async ({ page, context }) => {
  test.setTimeout(60000);
  const db = await setup(page);
  db.tableMissing = true;
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: savedHome.latitude, longitude: savedHome.longitude, accuracy: 15 });
  await page.goto('/');
  await openAccount(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Usar minha localização atual' }).click();
  await expect(page.getByLabel('Latitude da casa')).toHaveValue(savedHome.latitude.toFixed(6));
  await expect(page.locator('#home-address')).toHaveValue('Minha casa');
  await page.getByRole('button', { name: 'Salvar localização', exact: true }).click();
  await expect(page.getByText('Localização salva na sua conta.', { exact: false })).toBeVisible();
  expect(db.profileWrites).toBe(1);
  expect(db.writes).toBe(0);
  expect(db.profileHome?.latitude).toBe(savedHome.latitude);
  const claims = JSON.parse(Buffer.from(db.profileAuthorization.split('.')[1], 'base64url').toString());
  expect(claims.sub).toBe(userId);
  await page.reload();
  await openAccount(page);
  await expect(page.locator('#home-address')).toHaveValue('Minha casa');
  await expect(page.getByLabel('Latitude da casa')).toHaveValue(String(savedHome.latitude));
  // Applying the optional table later must not hide previously saved profile data.
  db.tableMissing = false;
  await page.reload();
  await openAccount(page);
  await expect(page.locator('#home-address')).toHaveValue('Minha casa');
  await page.getByRole('button', { name: 'Excluir localização' }).click();
  await expect(page.getByText('Localização excluída da sua conta.')).toBeVisible();
  expect(db.profileHome).toBeNull();
});

test('falha no perfil não confirma salvamento nem perde os dados preenchidos', async ({ page }) => {
  const db = await setup(page);
  db.tableMissing = true;
  db.profileFail = true;
  await page.goto('/');
  await openAccount(page);
  await page.locator('#home-address').fill('Casa de teste');
  await page.getByLabel('Latitude da casa').fill('-23.5');
  await page.getByLabel('Longitude da casa').fill('-46.6');
  await page.getByRole('button', { name: 'Salvar localização', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível salvar');
  await expect(page.locator('#home-address')).toHaveValue('Casa de teste');
  await expect(page.getByRole('button', { name: 'Abrir radar 3D' })).toHaveCount(0);
  expect(db.profileHome).toBeNull();
  db.profileFail = false;
  await page.getByRole('button', { name: 'Salvar localização', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abrir radar 3D' })).toBeVisible();
});

test('resposta de salvamento no perfil após sair não restaura a localização na tela', async ({ page }) => {
  const db = await setup(page);
  db.tableMissing = true;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${host}/auth/v1/user`, async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const saved = route.request().postDataJSON().data.home_radar;
    await held;
    return route.fulfill({ json: { id: userId, user_metadata: { home_radar: saved } } });
  });
  await page.goto('/');
  await openAccount(page);
  await page.locator('#home-address').fill('Casa de teste');
  await page.getByLabel('Latitude da casa').fill('-23.5');
  await page.getByLabel('Longitude da casa').fill('-46.6');
  const saving = page.waitForRequest(request => request.url() === `${host}/auth/v1/user` && request.method() === 'PUT');
  await page.getByRole('button', { name: 'Salvar localização', exact: true }).click();
  await saving;
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
  const finished = page.waitForResponse(response => response.url() === `${host}/auth/v1/user` && response.request().method() === 'PUT');
  release();
  await finished;
  await expect(page.locator('#home-address')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir radar 3D' })).toHaveCount(0);
  await expect(page.getByText('Localização salva na sua conta.', { exact: false })).toHaveCount(0);
});
