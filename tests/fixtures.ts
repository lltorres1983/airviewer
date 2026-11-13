import type { Page } from "@playwright/test";
import type { AdsbAircraft } from "../web/src/lib/types";

export async function fixtures(page: Page, aircraft?: AdsbAircraft[]) {
  const now = Date.now();
  await page.route("https://**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("tiles.openfreemap.org/styles/")) {
      return route.fulfill({
        json: {
          version: 8,
          glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#10273b" },
            },
          ],
        },
      });
    }
    if (url.endsWith("/planet"))
      return route.fulfill({
        json: { tilejson: "3.0.0", tiles: [], vector_layers: [] },
      });
    if (url.includes("api.rainviewer.com")) return route.fulfill({ json: { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: Math.floor(Date.now()/1000), path: '/v2/radar/test-frame' }] } } });
    if (url.includes('ImageServer/query')) return route.fulfill({ json: { features: [{ attributes: { objectid: 12, start_time: Date.now() } }] } });
    if (url.includes('ImageServer/exportImage') || url.includes('tilecache.rainviewer.com')) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
    if (url.includes("api.open-meteo.com")) return route.fulfill({ json: localWeatherFixture() });
    if (url.includes("api.adsb.lol"))
      return route.fulfill({
        json: {
          now: Date.now(),
          total: 1,
          ac: aircraft || [
            {
              hex: "abc123",
              flight: "TAM1234",
              r: "PT-ABC",
              t: "A320",
              lat: -23.43,
              lon: -46.47,
              alt_baro: 5000,
              track: 120,
              baro_rate: -500,
              gs: 180,
              seen_pos: 1,
            },
          ],
        },
      });
    if (url.includes("api.adsbdb.com"))
      return route.fulfill({ json: { response: {} } });
    if (url.includes("planespotters"))
      return route.fulfill({ json: { photos: [] } });
    return route.fulfill({ status: 200, body: "", contentType: "text/plain" });
  });
  await page.route("**/schedule.json", (route) =>
    route.fulfill({
      json: {
        start: now - 3600000,
        end: now + 86400000,
        airports: {
          GRU: [
            {
              flight: "TAM1234",
              direction: "arrival",
              time: now + 600000,
              airport: "GIG",
            },
          ],
          GIG: [],
          SDU: [],
        },
      },
    }),
  );
}

export function localWeatherFixture(time = Math.floor(Date.now() / 1000)) {
  return { current: { time, interval: 900, temperature_2m: 24.5, apparent_temperature: 26, relative_humidity_2m: 70,
    precipitation: .2, weather_code: 61, cloud_cover: 80, wind_speed_10m: 12, wind_direction_10m: 90, wind_gusts_10m: 25 },
    current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h', precipitation: 'mm' } };
}

// Existing traffic-list regressions explicitly open the secondary legacy view.
export async function openLegacyMovements(page: Page) {
  const details = page.locator('.tower-other-movements');
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
}
