import { test, expect } from '@playwright/test';
test.use({ actionTimeout: 15000 });
test.setTimeout(60000);
import { fixtures } from './fixtures';
import { parseRainFrame, parseCloudFrame, WEATHER_MAX_AGE } from '../web/src/lib/weather-layers';

test('camadas usam composição recente e satélite fixado na captura, sem aceitar URLs arbitrárias', () => {
  const now = Date.now();
  const rain = { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: Math.floor(now / 1000), path: '/v2/radar/hash-123' }] } };
  expect(parseRainFrame(rain, now).tiles).toContain('/hash-123/256/{z}/{x}/{y}/2/1_0.png');
  expect(() => parseRainFrame({ ...rain, host: 'https://example.com' }, now)).toThrow();
  expect(() => parseRainFrame(rain, now + WEATHER_MAX_AGE + 1000)).toThrow();
  expect(() => parseRainFrame({ ...rain, radar: { past: [{ time: now / 1000, path: '/v2/radar/../../bad' }] } }, now)).toThrow();
  const cloud = { features: [{ attributes: { objectid: 42, start_time: now } }] };
  const tile = parseCloudFrame(cloud, now).tiles;
  expect(tile).toContain('&bbox={bbox-epsg-3857}');
  expect(JSON.parse(new URL(tile).searchParams.get('mosaicRule')!).lockRasterIds).toEqual([42]);
  expect(() => parseCloudFrame(cloud, now + WEATHER_MAX_AGE + 1)).toThrow();
  expect(() => parseCloudFrame({ features: [] })).toThrow();
});

test('falha das imagens é sinalizada e atualização recupera camadas sem ocultar aeronaves', async ({ page }) => {
  await fixtures(page);
  let fail = true; let cloudTiles = 0; let rainTiles = 0;
  await page.route('https://satellitemaps.nesdis.noaa.gov/**/exportImage?**', async route => {
    cloudTiles++;
    if (fail) return route.fulfill({ status: 503 });
    return route.fallback();
  });
  page.on('request', request => { if (request.url().includes('tilecache.rainviewer.com/v2/radar/')) rainTiles++; });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: -23.4356, longitude: -46.4731, accuracy: 10 });
  await page.goto('/#/radar');
  const panel = page.getByRole('dialog', { name: 'Radar perto de mim', exact: true });
  await panel.getByRole('button', { name: 'Usar localização agora' }).click();
  await expect(panel.getByRole('alert')).toContainText('Não foi possível carregar uma camada');
  await expect(panel.locator('.nearby-flights')).toContainText('TAM1234');
  fail = false;
  await panel.getByRole('button', { name: 'Atualizar camadas', exact: true }).click();
  await expect(panel.locator('.weather-traffic-map')).toHaveAttribute('data-clouds', 'true');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(cloudTiles).toBeGreaterThan(1); expect(rainTiles).toBeGreaterThan(0);
});

test('página da câmera abre diretamente sem mapa e solicita localização explicitamente', async ({ page }) => {
  await fixtures(page);
  await page.goto('/#/camera');
  const camera = page.getByRole('main', { name: 'Câmera do céu' });
  await expect(camera.getByRole('button', { name: 'Usar localização agora' })).toBeVisible();
  await expect(page.locator('.maplibregl-map')).toHaveCount(0);
  await expect(camera.locator('video')).toHaveCount(0);
  await camera.getByRole('link', { name: 'Voltar ao radar' }).click();
  await expect(page.getByRole('dialog', { name: 'Radar perto de mim', exact: true })).toBeVisible();
});
