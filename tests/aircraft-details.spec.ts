import { test, expect, type Page } from "@playwright/test";
import { fixtures, openLegacyMovements } from "./fixtures";

const firstAircraft = {
  hex: "abc123",
  flight: "TAM1234",
  r: "PT-ABC",
  t: "A320",
  lat: -23.4356,
  lon: -46.4731,
  alt_baro: 5000,
  track: 120,
  baro_rate: -500,
  gs: 180,
  seen_pos: 1,
};
const secondAircraft = {
  ...firstAircraft,
  hex: "def456",
  flight: "GLO4321",
  r: "PR-XYZ",
  lat: -23.44,
  lon: -46.48,
};
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhXkAAAAASUVORK5CYII=",
  "base64",
);

async function detailsFixtures(page: Page) {
  await page.route("https://api.adsbdb.com/v0/callsign/**", (route) =>
    route.fulfill({
      json: {
        response: {
          flightroute: {
            origin: {
              municipality: "Rio de Janeiro",
              iata_code: "GIG",
              name: "Aeroporto do Galeão",
            },
            destination: {
              municipality: "São Paulo",
              iata_code: "GRU",
              name: "Aeroporto de Guarulhos",
            },
            airline: {
              name: "Companhia de teste",
              country: "Brasil",
              icao: "TAM",
              iata: "LA",
              callsign: "TAM",
            },
          },
        },
      },
    }),
  );
  await page.route(
    "https://api.planespotters.net/pub/photos/reg/**",
    (route) => {
      const prefix = route.request().url().split("/").pop();
      return route.fulfill({
        json: {
          photos: [
            {
              thumbnail_large: { src: `https://t.plnspttrs.net/${prefix}.jpg` },
              link: `https://www.planespotters.net/photo/${prefix}`,
              photographer: "Fotógrafo de teste",
            },
          ],
        },
      });
    },
  );
  await page.route("https://t.plnspttrs.net/**", (route) =>
    route.fulfill({ contentType: "image/png", body: pixel }),
  );
}

async function selectFromList(page: Page, flight = "TAM1234") {
  await openLegacyMovements(page);
  await page.locator("#live-tab").click();
  await page
    .getByRole("button", { name: `Acompanhar ${flight}`, exact: true })
    .click();
}

test("clique no mapa mostra foto pelo prefixo, cidades e companhia", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fixtures(page, [firstAircraft]);
  await detailsFixtures(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect
    .poll(() =>
      page.locator("html").getAttribute("data-airport-traffic-received-at"),
    )
    .not.toBeNull();
  await page.locator("#zoom-control").evaluate((input: HTMLInputElement) => {
    input.value = "12.5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Leste", exact: true }).click();
  // The aircraft is exactly at the airport/map center. Exercise the real MapLibre hit target.
  await expect(async () => {
    await page.mouse.click(720, 500);
    await expect(page.locator(".aircraft-details")).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 15000 });
  await expect(page.locator("#mode-eyebrow")).toHaveText("VISAO PANORAMICA 3D");
  await expect(page.locator("#zoom-control")).toHaveValue("12.5");
  await expect(page.locator("#cardinal-value")).toHaveText("L 090°");
  await expect(page.getByAltText("Foto da aeronave PT-ABC")).toBeVisible();
  await expect(page.locator(".aircraft-route-details")).toContainText(
    "Rio de Janeiro",
  );
  await expect(page.locator(".aircraft-route-details")).toContainText(
    "São Paulo",
  );
  await expect(page.locator(".airline-details")).toContainText(
    "Companhia de teste",
  );
  await expect(page.locator(".airline-details")).toContainText("TAM / LA");
  await expect(
    page.locator(".selected-aircraft-photo figcaption"),
  ).toContainText("Fotógrafo de teste");
  await expect(page.locator(".selected-aircraft-photo > a")).toHaveAttribute(
    "href",
    "https://www.planespotters.net/photo/PT-ABC",
  );
  await page.locator("#airport-select").selectOption("GIG");
  await expect(page.locator(".aircraft-details")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("resolve prefixo ausente pelo hex e informa dados indisponíveis", async ({
  page,
}) => {
  await fixtures(page, [{ ...firstAircraft, r: undefined }]);
  await page.route("https://api.adsbdb.com/v0/aircraft/abc123", (route) =>
    route.fulfill({
      json: {
        response: { aircraft: { registration: "PR-NEW", icao_type: "A320" } },
      },
    }),
  );
  const requested: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("photos/reg/")) requested.push(request.url());
  });
  await page.goto("/");
  await selectFromList(page);
  await expect(page.locator(".aircraft-details-header")).toContainText(
    "PR-NEW",
  );
  await expect(page.locator(".aircraft-photo-state")).toHaveText(
    "Nenhuma foto disponível para PR-NEW.",
  );
  await expect(page.locator(".airline-details")).toContainText(
    "Companhia não informada pela fonte.",
  );
  await expect(page.locator(".aircraft-route-details")).toContainText(
    "Cidade não informada",
  );
  expect(requested).toContain(
    "https://api.planespotters.net/pub/photos/reg/PR-NEW",
  );
});

test("troca rápida de aeronave descarta respostas anteriores", async ({
  page,
}) => {
  await fixtures(page, [firstAircraft, secondAircraft]);
  await detailsFixtures(page);
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "https://api.planespotters.net/pub/photos/reg/PT-ABC",
    async (route) => {
      await waiting;
      await route.fulfill({ json: { photos: [] } }).catch(() => {});
    },
  );
  await page.goto("/");
  await selectFromList(page);
  await expect(page.locator(".aircraft-photo-state")).toContainText(
    "Buscando foto",
  );
  await page
    .getByRole("button", { name: "Acompanhar GLO4321", exact: true })
    .click();
  await expect(page.getByAltText("Foto da aeronave PR-XYZ")).toBeVisible();
  release();
  await expect(page.locator("#selected-aircraft-title")).toHaveText("GLO4321");
  await expect(page.getByAltText("Foto da aeronave PT-ABC")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Fechar detalhes da aeronave" })
    .click();
  await expect(page.locator(".aircraft-details")).toHaveCount(0);
});

test("detalhes ficam acessíveis no celular e podem ser fechados", async ({
  page,
}) => {
  await fixtures(page, [firstAircraft]);
  await detailsFixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#mobile-menu-toggle").click();
  await page
    .getByRole("button", { name: "Fila de aproximação", exact: true })
    .click();
  await selectFromList(page);
  await expect(page.locator("#mobile-panel")).toBeHidden();
  await expect(page.getByAltText("Foto da aeronave PT-ABC")).toBeVisible();
  const box = await page.locator(".right-rail").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThan(780);
  await page.locator(".airline-details").scrollIntoViewIfNeeded();
  await expect(page.locator(".airline-details")).toContainText(
    "Companhia de teste",
  );
  await page
    .getByRole("button", { name: "Fechar detalhes da aeronave" })
    .click();
  await expect(page.locator(".aircraft-details")).toHaveCount(0);
});

test("erro na foto permite tentar novamente sem esconder a rota", async ({
  page,
}) => {
  await fixtures(page, [firstAircraft]);
  await detailsFixtures(page);
  let fail = true;
  await page.route(
    "https://api.planespotters.net/pub/photos/reg/PT-ABC",
    (route) =>
      route.fulfill(
        fail ? { status: 503, body: "" } : { json: { photos: [] } },
      ),
  );
  await page.goto("/");
  await selectFromList(page);
  await expect(page.locator(".aircraft-photo-state")).toHaveText(
    "Não foi possível carregar a foto.",
  );
  await expect(page.locator(".aircraft-route-details")).toContainText(
    "São Paulo",
  );
  fail = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.locator(".aircraft-photo-state")).toHaveText(
    "Nenhuma foto disponível para PT-ABC.",
  );
});
