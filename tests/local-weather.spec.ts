import { test, expect, type Page } from '@playwright/test';
test.use({ actionTimeout: 15000 });
test.setTimeout(60000);
import { fixtures, localWeatherFixture } from './fixtures';
import { parseLocalWeather, weatherDescription } from '../web/src/lib/local-weather';

test('meteorologia valida unidades, valores ausentes e condições sem fabricar dados', () => {
  expect(parseLocalWeather(localWeatherFixture()).temperature_2m).toBe(24.5);
  const missing = localWeatherFixture();
  expect(parseLocalWeather({ ...missing, current: { ...missing.current, temperature_2m: null } }).temperature_2m).toBeNull();
  expect(() => parseLocalWeather({ ...missing, current_units: { ...missing.current_units, wind_speed_10m: 'mph' } })).toThrow();
  expect(() => parseLocalWeather({ ...missing, current: { ...missing.current, cloud_cover: 120 } })).toThrow();
  expect(weatherDescription(95)).toBe('Trovoadas');
  expect(weatherDescription(51)).toBe('Garoa fraca');
  expect(weatherDescription(null)).toBe('Condição não informada');
});
async function openRadar(page: Page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: -23.4356, longitude: -46.4731, accuracy: 10 });
  await page.goto('/'); await page.getByRole('button', { name: 'Radar perto de mim', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Radar perto de mim', exact: true });
  await panel.getByRole('button', { name: 'Usar localização agora' }).click();
  return panel;
}
test('radar com camadas geográficas, meteorologia local e layout móvel', async ({ page }) => {
  test.setTimeout(90000);
  await fixtures(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const panel = await openRadar(page);
  const weather = panel.getByRole('region', { name: 'Meteorologia da localização atual' });
  await expect(weather).toContainText('24,5 °C', { timeout: 15000 });
  await expect(weather).toContainText('Chuva fraca');
  await expect(weather).toContainText('12 km/h');
  await expect(weather).toContainText('25 km/h');
  await expect(weather).toContainText('80%');
  await expect(weather).toContainText('0,2 mm');
  const map = panel.locator('.weather-traffic-map');
  await expect(map.locator('canvas')).toBeVisible();
  await expect(map).toHaveAttribute('data-clouds', 'true');
  await expect(map).toHaveAttribute('data-rain', 'true');
  await expect(panel).toContainText('Satélite · captura');
  await expect(panel).toContainText('Precipitação · composição');
  await expect(panel.locator('video')).toHaveCount(0);
  await panel.getByRole('checkbox', { name: 'Precipitação', exact: true }).uncheck();
  await expect(map).toHaveAttribute('data-rain', 'false');
  await panel.getByRole('checkbox', { name: 'Precipitação', exact: true }).check();
  await panel.screenshot({ path: 'test-results/radar-weather-layout.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await map.screenshot({ path: 'test-results/radar-weather-mobile.png' });
  expect(errors).toEqual([]);
});
test('falha meteorológica permite tentar novamente e dados antigos são sinalizados', async ({ page }) => {
  await fixtures(page); let failing = true;
  await page.route('https://api.open-meteo.com/**', route => failing ? route.fulfill({ status: 503 }) : route.fulfill({ json: localWeatherFixture(Math.floor(Date.now() / 1000) - 7200) }));
  const panel = await openRadar(page); const weather = panel.getByRole('region', { name: 'Meteorologia da localização atual' });
  await expect(weather.getByRole('alert')).toContainText('Meteorologia indisponível');
  await expect(weather).not.toContainText('24,5');
  failing = false; await weather.getByRole('button', { name: 'Atualizar tempo' }).click();
  await expect(weather).toContainText('Dados desatualizados');
  await expect(weather).toContainText('24,5 °C', { timeout: 15000 });
  await expect(weather.getByRole('alert')).toHaveCount(0);
});
