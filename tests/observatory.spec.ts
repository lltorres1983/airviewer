import { test, expect, type Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { frameAt, trimFrames, type TrafficFrame } from '../web/src/lib/traffic-recording';
import { diaryBackup, parseDiaryBackup, validDiaryEntry, type DiaryEntry } from '../web/src/lib/spotting-diary';
test.use({ actionTimeout: 30000 });
const userId = '11111111-1111-4111-8111-111111111111';
async function login(page: Page) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const session = { access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: expires })}.dGVzdA`, refresh_token: 'test', token_type: 'bearer', expires_at: expires, expires_in: 3600,
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'spotter@example.test', app_metadata: { provider: 'google' }, user_metadata: {}, created_at: new Date().toISOString() } };
  await page.addInitScript(session => { localStorage.setItem('sb-airviewer-test-auth-token', JSON.stringify(session)); }, session);
  await page.route('**/rest/v1/aircraft_favorites**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/home_radar**', route => route.fulfill({ json: null }));
  await page.route('**/auth/v1/user', route => route.fulfill({ json: session.user }));
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Central de acompanhamento', exact: true }).click();
  return page.getByRole('dialog', { name: 'Central de acompanhamento', exact: true });
}
test('replay limita retenção e não fabrica posições durante lacunas', () => {
  const now = Date.now();
  const frame = (time: number, airport: 'GRU' | 'GIG' = 'GRU'): TrafficFrame => ({ id: `${airport}:${time}`, airport, time, aircraft: [] });
  const frames = [frame(now - 3600001), frame(now - 120000), frame(now)];
  expect(trimFrames([...frames, frames[2]], now)).toHaveLength(2);
  expect(frameAt(frames, now - 60000)?.time).toBe(now - 120000);
  expect(frameAt(frames, now - 59000)).toBeNull();
  expect(frameAt(frames, now - 4000000)).toBeNull();
  expect(trimFrames(Array.from({ length: 300 }, (_, i) => frame(now - i * 1000)), now)).toHaveLength(240);
});
test('backup valida fotos, versão e campos sem exportar o identificador da conta', () => {
  const entry: DiaryEntry & { owner: string; key: string } = { id: 'test-1', hex: 'abc123', registration: 'PT-ABC', type: 'A320', flight: 'TAM123', airport: 'GRU', observedAt: new Date().toISOString(), notes: 'Teste', photo: null, owner: 'private-owner', key: 'private-key' };
  expect(validDiaryEntry(entry)).toBe(true);
  expect(diaryBackup([entry])).not.toContain('private');
  expect(parseDiaryBackup(diaryBackup([entry]))).toHaveLength(1);
  expect(validDiaryEntry({ ...entry, photo: 'data:image/svg+xml,<svg onload=alert(1)>' })).toBe(false);
  expect(() => parseDiaryBackup('{"version":2,"entries":[]}')).toThrow();
  expect(validDiaryEntry({ ...entry, notes: 'a'.repeat(2001) })).toBe(false);
});
test('replay persistente, comparação independente e navegação móvel', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixtures(page);
  await page.route('**/weather.json', route => route.fulfill({ json: { generatedAt: new Date().toISOString(), metars: [], tafs: [] } }));
  await page.route('**/api.adsb.lol/v2/point/**', route => {
    const gig = route.request().url().includes('-22.809');
    return route.fulfill({ json: { now: Date.now(), ac: [{ hex: gig ? 'def456' : 'abc123', flight: gig ? 'GLO222' : 'TAM1234', r: gig ? 'PR-GIG' : 'PT-ABC', t: 'A320', lat: gig ? -22.82 : -23.43, lon: gig ? -43.3 : -46.47, alt_baro: 5000, track: 90, baro_rate: -500, gs: 180, seen_pos: 1 }] } });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const panel = await open(page);
  await expect(panel).toContainText('PT-ABC');
  await expect(panel.locator('.observatory-map canvas')).toBeVisible();
  await panel.getByRole('tab', { name: 'GRU × GIG' }).click();
  await expect(panel.getByRole('region', { name: 'Comparação GRU' })).toContainText('1 aeronave');
  await expect(panel.getByRole('region', { name: 'Comparação GIG' })).toContainText('1 aeronave');
  await expect(panel.locator('.observatory-map canvas')).toHaveCount(2);
  await expect(panel).toContainText('Sem câmera ao vivo verificada');
  await panel.screenshot({ path: 'test-results/comparison-desktop.png' });
  await panel.getByRole('tab', { name: 'Replay', exact: true }).click();
  await panel.getByLabel('Aeroporto', { exact: true }).selectOption('GIG');
  await expect(panel).toContainText('PR-GIG');
  await page.reload();
  await open(page);
  await panel.getByLabel('Aeroporto', { exact: true }).selectOption('GIG');
  await expect(panel).toContainText('PR-GIG');
  await panel.getByRole('button', { name: 'Fechar central de acompanhamento' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-menu-toggle').click();
  await open(page);
  await panel.getByRole('tab', { name: 'GRU × GIG' }).click();
  await expect(panel.locator('.observatory-map canvas')).toHaveCount(2);
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await panel.screenshot({ path: 'test-results/comparison-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  expect(errors).toEqual([]);
});
test('diário salva foto, persiste, exporta, importa sem duplicar e separa contas', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixtures(page); await login(page); await page.goto('/');
  const panel = await open(page); await panel.getByRole('tab', { name: 'Meu diário' }).click();
  await panel.getByLabel('Matrícula', { exact: true }).fill('PT-ABC');
  await panel.getByLabel('Modelo', { exact: true }).fill('A320');
  await panel.getByLabel('Anotações', { exact: true }).fill('Minha primeira observação');
  const photo = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 20; canvas.getContext('2d')!.fillRect(0, 0, 20, 20); return canvas.toDataURL('image/png').split(',')[1]; });
  await panel.getByLabel(/Sua foto/).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
  await expect(panel.locator('.diary-photo-preview')).toBeVisible();
  await panel.getByRole('button', { name: 'Salvar observação' }).click();
  await expect(panel.locator('.diary-entries li')).toHaveCount(1);
  await expect(panel.locator('.diary-entries img')).toBeVisible();
  await expect(panel.locator('.diary-entries img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  const downloaded = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Exportar backup' }).click();
  const download = await downloaded; const path = await download.path();
  await panel.getByLabel('Importar backup', { exact: true }).setInputFiles(path!);
  await expect(panel).toContainText('0 registros importados');
  await panel.getByLabel('Importar backup', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2,"entries":[]}') });
  await expect(panel.getByRole('alert')).toContainText('Backup inválido');
  await expect(panel.locator('.diary-entries li')).toHaveCount(1);
  await page.reload(); await open(page); await panel.getByRole('tab', { name: 'Meu diário' }).click();
  await expect(panel.locator('.diary-entries li')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Editar', exact: true }).click();
  await panel.getByLabel('Anotações', { exact: true }).fill('Editada');
  await panel.getByRole('button', { name: 'Salvar observação' }).click();
  await expect(panel.locator('.diary-entries')).toContainText('Editada');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('airviewer-observatory', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const tx = db.transaction('diary', 'readwrite'); tx.objectStore('diary').put({ key: 'other:record', owner: 'other', id: 'record', hex: '', registration: 'PRIVATE', flight: '', type: '', airport: 'GIG', observedAt: new Date().toISOString(), notes: 'Outro usuário', photo: null });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  });
  await page.reload(); await open(page); await panel.getByRole('tab', { name: 'Meu diário' }).click();
  await expect(panel.locator('.diary-entries li')).toHaveCount(1);
  await expect(panel).not.toContainText('PRIVATE');
  page.on('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(panel.locator('.diary-entries li')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('diário exige login e comparação informa falha sem inventar tráfego', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api.adsb.lol/**', route => route.fulfill({ status: 503 }));
  await page.route('**/weather.json', route => route.fulfill({ status: 503 }));
  await page.goto('/'); const panel = await open(page);
  await panel.getByRole('tab', { name: 'Meu diário' }).click(); await expect(panel).toContainText('Entre na sua conta');
  await panel.getByRole('tab', { name: 'GRU × GIG' }).click();
  await expect(panel.getByRole('region', { name: 'Comparação GIG' })).toContainText('ADS-B temporariamente indisponível');
  await expect(panel).toContainText('Não foi possível atualizar a meteorologia');
});

test('replay em memória informa indisponibilidade de armazenamento', async ({ page }) => {
  await fixtures(page);
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
  await page.goto('/'); const panel = await open(page);
  await expect(panel).toContainText('O replay dura apenas esta visita');
  await expect(panel).toContainText('PT-ABC');
});
