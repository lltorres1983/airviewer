import { test, expect } from "@playwright/test";

import { fixtures } from "./fixtures";

test("mapa, shadcn, programação, seleção e controles no desktop", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixtures(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByAltText("Airviewer")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect.poll(() => page.workers().length).toBeGreaterThan(0);
  expect(await page.workers()[0].evaluate(() => 1)).toBe(1);
  await expect(page.locator("#recenter")).toHaveAttribute(
    "data-slot",
    "button",
  );
  await expect(page.locator(".schedule-row")).toContainText("TAM1234");
  await page.locator(".schedule-row").click();
  await expect(page.locator("#route")).toHaveText("GIG -> GRU");
  await page.locator("#live-tab").click();
  await expect(page.locator(".arrival-row")).toContainText("TAM1234");
  await page.getByRole("button", { name: "Leste", exact: true }).click();
  await expect(page.locator("#cardinal-value")).toHaveText("L 090°");
  await page.locator("#show-diagnostics").click();
  await expect(page.locator("#diagnostics")).toBeVisible();
  await page.locator("#close-diagnostics").click();
  await page.locator("#airport-select").selectOption("SDU");
  await expect(page.locator("#route")).toHaveText("TRAFEGO SDU");
  await expect(page.locator("#arrivals-title")).toHaveText("MOVIMENTOS - SDU");
  await page.screenshot({ path: "test-results/desktop.png" });
  await expect(page.locator("#diagnostics-text")).not.toContainText(
    "Worker failed",
  );
  expect(errors).toEqual([]);
});

test("menu, voos e câmera no celular, com retorno ao desktop", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#mobile-menu-toggle").click();
  await expect(page.locator("#mobile-options #airport-select")).toBeVisible();
  await page
    .getByRole("button", { name: "Próximos voos", exact: true })
    .click();
  await expect(page.locator(".schedule-row")).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-flights.png" });
  await page.locator(".schedule-row").click();
  await expect(page.locator("#mobile-panel")).toBeHidden();
  await page.locator("#mobile-menu-toggle").click();
  await page
    .getByRole("button", { name: "Câmera do aeroporto", exact: true })
    .click();
  await expect(page.locator("#airport-camera-frame")).toHaveAttribute(
    "src",
    /youtube-nocookie/,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#airport-camera-frame")).not.toHaveAttribute(
    "src",
  );
  await page.screenshot({ path: "test-results/mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.locator("body #root > .controls #airport-select"),
  ).toBeVisible();
  await expect(page.locator("#diagnostics-text")).not.toContainText(
    "Worker failed",
  );
  expect(errors).toEqual([]);
});

test("falhas nas APIs exibem estado de indisponibilidade", async ({ page }) => {
  await fixtures(page);
  await page.route("**/schedule.json", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.route("https://proxy.cors.dev/**", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.goto("/");
  await expect(page.locator("#schedule-list")).toContainText(
    "Programação temporariamente indisponível",
  );
  await page.locator("#live-tab").click();
  await expect(page.locator("#arrivals-list")).toContainText(
    "Sinal ADS-B temporariamente indisponível",
  );
});

test("redimensiona painéis e preserva o tamanho após recarregar", async ({ page }) => {
  await fixtures(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const panel = page.locator("#arrivals-panel");
  const handle = page.getByRole("button", { name: "Redimensionar movimentos", exact: true });
  await expect(handle).toBeVisible();
  const initial = (await panel.boundingBox())!;
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(Math.round(initial.width) + 16);
  await page.reload();
  await expect(panel).toBeVisible();
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(Math.round(initial.width) + 16);
  const grip = (await handle.boundingBox())!;
  const before = (await panel.boundingBox())!;
  await page.mouse.move(grip.x + 12, grip.y + 12);
  await page.mouse.down();
  await page.mouse.move(grip.x - 28, grip.y + 32);
  await page.mouse.up();
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(Math.round(before.width) + 40);
  await expect(page.locator("body")).not.toHaveClass(/resizing-panel/);
});

for (const tab of ['schedule', 'live']) {
  test(`movimentos ${tab} seleciona e centraliza a aeronave sem alterar zoom ou orientação`, async ({page}) => {
    await fixtures(page, [{hex:'abc123', flight:'TAM1234', r:'PT-ABC', t:'A320',
      lat:-23.4, lon:-46.3, alt_baro:5000, track:120, baro_rate:-500, gs:180, seen_pos:1}]);
    await page.setViewportSize({width:1440,height:1000});
    await page.goto('/');
    await expect.poll(() => page.locator('html').getAttribute('data-airport-traffic-received-at')).not.toBeNull();
    await page.getByRole('button',{name:'Leste',exact:true}).click();
    const zoom = await page.locator('#zoom-control').inputValue();
    if(tab === 'live') await page.locator('#live-tab').click();
    await page.locator(tab === 'live' ? '.arrival-row' : '.schedule-row').click();
    await expect(page.locator('.aircraft-details-header')).toContainText('PT-ABC');
    await expect(async () => {
      const marker = (await page.locator('.aircraft-marker').boundingBox())!;
      const map = (await page.locator('.maplibregl-canvas').boundingBox())!;
      expect(marker).not.toBeNull();
      expect(Math.abs(marker.x + marker.width / 2 - (map.x + map.width / 2))).toBeLessThan(3);
      expect(Math.abs(marker.y + marker.height / 2 - (map.y + map.height / 2))).toBeLessThan(3);
    }).toPass({timeout:10000});
    await expect(page.locator('#zoom-control')).toHaveValue(zoom);
    await expect(page.locator('#cardinal-value')).toHaveText('L 090°');
  });
}

test('programação busca o voo fora da área do aeroporto e centraliza sua posição', async ({ page }) => {
  await fixtures(page, []);
  await page.route('**/v2/callsign/TAM1234', route => route.fulfill({json:{ac:[{
    hex:'abc123', flight:'TAM1234 ', r:'PT-ABC', t:'A320', lat:-22.9, lon:-43.2,
    alt_baro:18000, track:220, seen_pos:2,
  }]}}));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await expect.poll(() => page.locator('html').getAttribute('data-airport-traffic-received-at')).not.toBeNull();
  await page.locator('.schedule-row').click();
  await expect(page.locator('.aircraft-details-header')).toContainText('PT-ABC');
  await expect(async () => {
    const marker = (await page.locator('.aircraft-marker').boundingBox())!;
    const map = (await page.locator('.maplibregl-canvas').boundingBox())!;
    expect(marker).not.toBeNull();
    expect(Math.abs(marker.x + marker.width / 2 - (map.x + map.width / 2))).toBeLessThan(3);
    expect(Math.abs(marker.y + marker.height / 2 - (map.y + map.height / 2))).toBeLessThan(3);
  }).toPass({timeout:10000});
});

test('programação não seleciona posição antiga ou de outro voo', async ({page}) => {
  await fixtures(page, []);
  await page.route('**/v2/callsign/TAM1234', route => route.fulfill({json:{ac:[
    {hex:'abc123', flight:'TAM1234', lat:-22.9, lon:-43.2, seen_pos:120},
    {hex:'abc124', flight:'TAM9999', lat:-22.9, lon:-43.2, seen_pos:1},
  ]}}));
  await page.goto('/');await page.locator('.schedule-row').click();
  await expect(page.locator('#status')).toContainText('sem posição ADS-B disponível');
  await expect(page.locator('.aircraft-marker')).toBeHidden();
  await expect(page.locator('.aircraft-details')).toHaveCount(0);
});

test('resposta atrasada da programação não troca a seleção de aeroporto', async ({page}) => {
  await fixtures(page, []);
  let release!: () => void;
  const wait = new Promise<void>(resolve => {release=resolve;});
  await page.route('**/v2/callsign/TAM1234', async route => {
    await wait;await route.fulfill({json:{ac:[{hex:'abc123',flight:'TAM1234',lat:-22.9,lon:-43.2,seen_pos:1}]}});
  });
  await page.goto('/');
  const requested=page.waitForRequest('**/v2/callsign/TAM1234');
  await page.locator('.schedule-row').click();await requested;
  await page.locator('#airport-select').selectOption('SDU');
  const response=page.waitForResponse('**/v2/callsign/TAM1234');release();await response;
  await expect(page.locator('#route')).toHaveText('TRAFEGO SDU');
  await expect(page.locator('.aircraft-marker')).toBeHidden();
});
