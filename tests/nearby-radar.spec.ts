import { test, expect, type Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { cameraHeading, directionCandidates, nearbyAircraft, type Observer } from '../web/src/lib/nearby-radar';
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
const origin: Observer = { latitude: -23.4356, longitude: -46.4731, accuracy: 10, time: Date.now() };
const north = { hex: 'abc123', flight: 'NEAR1000', r: 'PT-ABC', t: 'A320', lat: -23.4256, lon: -46.4731, alt_baro: 8000, track: 120, gs: 180, seen_pos: 1 };
const east = { ...north, hex: 'abc124', flight: 'EAST2000', lat: origin.latitude, lon: -46.45 };
test('radar filtra solo, dados antigos e voos fora do raio; câmera usa norte absoluto', () => {
  const rows = nearbyAircraft([north, east, { ...north, hex: 'ground', alt_baro: 'ground' }, { ...north, hex: 'old', seen_pos: 31 }, { ...north, hex: 'far', lat: -20 }, { ...north, hex: 'missing', seen_pos: undefined }, { ...north, hex: 'bad', lat: NaN }], origin, 20);
  expect(rows).toHaveLength(2);
  expect(rows[0].bearing).toBeCloseTo(0);
  expect(directionCandidates(rows, 359).map(a => a.hex)).toEqual(['abc123']);
  expect(directionCandidates(rows, null)).toEqual([]);
  expect(cameraHeading({ alpha: 0, beta: 90, gamma: 0, absolute: true })).toBeCloseTo(0);
  expect(cameraHeading({ alpha: 270, beta: 90, gamma: 0, absolute: true })).toBeCloseTo(90);
  expect(cameraHeading({ alpha: 90, beta: 90, gamma: 0, absolute: true })).toBeCloseTo(270);
  expect(cameraHeading({ alpha: 10, beta: 90, gamma: 0, absolute: false })).toBeNull();
  expect(cameraHeading({ alpha: 0, beta: 0, gamma: 0, absolute: true })).toBeNull();
  expect(cameraHeading({ alpha: 0, beta: 90, gamma: 90, absolute: true })).toBeNull();
  expect(cameraHeading({ alpha: 0, beta: 90, gamma: 0, absolute: false, webkitCompassHeading: 45, webkitCompassAccuracy: 10 })).toBe(45);
  expect(cameraHeading({ alpha: 0, beta: 90, gamma: 0, absolute: false, webkitCompassHeading: 45, webkitCompassAccuracy: -1 })).toBeNull();
});
async function setup(page: Page) {
  await fixtures(page, [north, east]);
  await page.context().grantPermissions(['geolocation', 'camera']);
  await page.context().setGeolocation({ ...origin });
  await page.goto('/');
  await page.getByRole('button', { name: 'Radar perto de mim', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Radar perto de mim', exact: true });
  await panel.getByRole('button', { name: 'Usar localização agora', exact: true }).click();
  await expect(panel.locator('.nearby-flights')).toContainText('NEAR1000');
  return panel;
}
async function mockCamera(page: Page, permission: 'granted' | 'denied' = 'granted') {
  await page.addInitScript(permission => {
    const state = { stopped: 0, requested: 0, audio: true, facingMode: '', requestedAbsolute: false };
    (window as unknown as { cameraTest: typeof state }).cameraTest = state;
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { configurable: true, value: async (absolute: boolean) => { state.requestedAbsolute = absolute; return permission; } });
    const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async (constraints: MediaStreamConstraints) => {
      state.requested++; state.audio = constraints.audio !== false;
      state.facingMode = JSON.stringify((constraints.video as MediaTrackConstraints).facingMode);
      const stream = await acquire({ video: true, audio: false });
      stream.getTracks().forEach(track => { const stop = track.stop.bind(track); track.stop = () => { state.stopped++; stop(); }; });
      return stream;
    } });
  }, permission);
}
test('radar temporário, câmera por direção e encerramento dos recursos', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await mockCamera(page);
  const panel = await setup(page);
  await page.route('https://api.planespotters.net/pub/photos/reg/PT-ABC', route => route.fulfill({ json: { photos: [{
    thumbnail: { src: 'https://t.plnspttrs.net/sky-small.jpg' }, thumbnail_large: { src: 'https://t.plnspttrs.net/sky-large.jpg' },
    link: 'https://www.planespotters.net/photo/sky-test', photographer: 'Fotógrafo de teste',
  }] } }));
  await page.route('https://t.plnspttrs.net/sky-small.jpg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#b9d4e6"/><text x="120" y="90" text-anchor="middle" fill="#132b40" font-size="20">FOTO DE TESTE</text></svg>' }));
  await expect(panel.getByRole('button', { name: 'Ver NEAR1000', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Ver NEAR1000', exact: true }).click();
  await expect(panel.locator('.nearby-selection')).toContainText('PT-ABC');
  await panel.getByRole('button', { name: 'Ativar câmera e bússola' }).click();
  await expect(panel.locator('.sky-view')).toHaveClass(/is-enabled/);
  await expect(panel.getByRole('button', { name: 'Reativar câmera e bússola' })).toBeEnabled();
  await page.evaluate(() => {
    // Hardware emits a stream; a single synthetic event can precede React's effect.
    const publish = () => {
      const event = new DeviceOrientationEvent('deviceorientation', { alpha: 12, beta: 90, gamma: 0, absolute: false });
      Object.defineProperties(event, { webkitCompassHeading: { value: 0 }, webkitCompassAccuracy: { value: 10 } });
      window.dispatchEvent(event);
    };
    publish(); window.setInterval(publish, 250);
  });
  await expect(panel.locator('.sky-candidates')).toContainText('NEAR1000');
  await expect(panel.locator('.sky-candidates')).not.toContainText('EAST2000');
  const thumbnail = panel.getByRole('img', { name: 'Foto de PT-ABC', exact: true });
  await expect(thumbnail).toHaveAttribute('src', 'https://t.plnspttrs.net/sky-small.jpg');
  await expect(panel.locator('.sky-candidates')).toContainText('Foto: Fotógrafo de teste');
  await expect(panel.getByRole('link', { name: 'Abrir foto de PT-ABC no Planespotters' })).toHaveAttribute('href', 'https://www.planespotters.net/photo/sky-test');
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.locator('.sky-view').screenshot({ path: 'test-results/sky-photo-mobile.png' });
  expect(await panel.locator('.sky-candidates').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await thumbnail.evaluate(image => image.dispatchEvent(new Event('error')));
  await expect(panel.locator('.sky-candidates')).toContainText('Sem foto');
  await expect(thumbnail).toHaveCount(0);
  await expect(panel.locator('.sky-candidates')).toContainText('NEAR1000');
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await page.evaluate(() => (window as unknown as { cameraTest: { audio: boolean } }).cameraTest.audio)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { cameraTest: { requestedAbsolute: boolean } }).cameraTest.requestedAbsolute)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { cameraTest: { facingMode: string } }).cameraTest.facingMode)).toContain('environment');
  await panel.screenshot({ path: 'test-results/nearby-desktop.png' });
  await panel.getByRole('button', { name: 'Desligar câmera' }).click();
  expect(await page.evaluate(() => (window as unknown as { cameraTest: { stopped: number } }).cameraTest.stopped)).toBe(1);
  await panel.getByRole('button', { name: 'Ativar câmera e bússola' }).click();
  await expect(panel.locator('.sky-view')).toHaveClass(/is-enabled/);
  await panel.getByRole('button', { name: 'Fechar radar perto de mim' }).click();
  expect(await page.evaluate(() => (window as unknown as { cameraTest: { stopped: number } }).cameraTest.stopped)).toBe(2);
  await page.getByRole('button', { name: 'Radar perto de mim', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Usar localização agora' })).toBeVisible();
  await expect(panel.locator('.nearby-flights')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('bússola negada não sugere voos; câmera para ao ocultar a página e layout funciona no celular', async ({ page }) => {
  test.setTimeout(90000);
  await mockCamera(page, 'denied'); const panel = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole('button', { name: 'Ativar câmera e bússola' }).click();
  await expect(panel).toContainText('Bússola não autorizada ou indisponível');
  await expect(panel.locator('.sky-candidates')).not.toContainText('NEAR1000');
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await panel.locator('.sky-guide').screenshot({ path: 'test-results/sky-mobile.png' });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(panel.locator('.sky-view')).not.toHaveClass(/is-enabled/);
  expect(await page.evaluate(() => (window as unknown as { cameraTest: { stopped: number } }).cameraTest.stopped)).toBe(1);
});
test('permissão de localização negada informa erro sem consultar radar privado', async ({ page }) => {
  await fixtures(page);
  let nearbyRequests = 0;
  page.on('request', request => { if (request.url().includes('/point/') && request.url().endsWith('/11')) nearbyRequests++; });
  await page.addInitScript(() => Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { value: (_ok: unknown, error: (e: { code: number }) => void) => error({ code: 1 }) }));
  await page.goto('/'); await page.getByRole('button', { name: 'Radar perto de mim', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Radar perto de mim', exact: true });
  await panel.getByRole('button', { name: 'Usar localização agora' }).click();
  await expect(panel.getByRole('alert')).toContainText('Acesso à localização negado');
  await expect(panel.locator('.nearby-radar')).toHaveCount(0);
  expect(nearbyRequests).toBe(0);
});
test('câmera negada mantém radar e não mostra candidatos', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }));
  const panel = await setup(page);
  await panel.getByRole('button', { name: 'Ativar câmera e bússola' }).click();
  await expect(panel.getByRole('alert')).toContainText('Permissão de câmera negada');
  await expect(panel.locator('.nearby-flights')).toContainText('NEAR1000');
  await expect(panel.locator('.sky-candidates')).toHaveCount(0);
});

test('câmera autorizada depois de fechar é encerrada sem reabrir o painel', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { lateStopped: number }).lateStopped = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => new Promise<MediaStream>(resolve => {
      (window as unknown as { resolveCamera: () => void }).resolveCamera = () => {
        const canvas = document.createElement('canvas'); const stream = canvas.captureStream();
        stream.getTracks().forEach(track => { const stop = track.stop.bind(track); track.stop = () => { (window as unknown as { lateStopped: number }).lateStopped++; stop(); }; });
        resolve(stream);
      };
    }) });
  });
  const panel = await setup(page);
  await panel.getByRole('button', { name: 'Ativar câmera e bússola' }).click();
  await expect(panel.getByRole('button', { name: 'Abrindo câmera…' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Fechar radar perto de mim' }).click();
  await page.evaluate(() => (window as unknown as { resolveCamera: () => void }).resolveCamera());
  await expect.poll(() => page.evaluate(() => (window as unknown as { lateStopped: number }).lateStopped)).toBe(1);
  await expect(panel).not.toBeVisible();
});

test('vídeo que não inicia encerra a câmera e permite tentar novamente', async ({ page }) => {
  await mockCamera(page);
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => new Promise<void>(() => {}); });
  const panel = await setup(page);
  await panel.getByRole('button', { name: 'Ativar câmera e bússola' }).click();
  await expect(panel.getByRole('alert')).toContainText('Não foi possível abrir a câmera', { timeout: 15000 });
  await expect(panel.getByRole('button', { name: 'Ativar câmera e bússola' })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { cameraTest: { stopped: number } }).cameraTest.stopped)).toBe(1);
  await expect(panel.locator('.sky-candidates')).toHaveCount(0);
});
