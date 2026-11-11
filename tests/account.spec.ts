import { test, expect, type Page } from "@playwright/test";
import { fixtures } from "./fixtures";
import type { Favorite } from "../web/src/lib/database.types";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const authHost = "https://airviewer-test.supabase.co";
const storageKey = "sb-airviewer-test-auth-token";
function sessionFor(id = userId) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, aud: "authenticated", role: "authenticated", exp: expires })}.dGVzdA`,
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expires,
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: id === userId ? "ana@example.test" : "bia@example.test",
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: { full_name: id === userId ? "Ana Teste" : "Bia Teste" },
      created_at: new Date().toISOString(),
    },
  };
}
async function seedSession(page: Page) {
  await page.addInitScript(
    ({ key, session }) => {
      if (!sessionStorage.getItem("fixture-auth-seeded")) {
        localStorage.setItem(key, JSON.stringify(session));
        sessionStorage.setItem("fixture-auth-seeded", "true");
      }
    },
    { key: storageKey, session: sessionFor() },
  );
}
async function mockBackend(page: Page, initial: Favorite[] = []) {
  await fixtures(page);
  const db = { rows: initial, failWrite: false, requests: [] as string[] };
  await page.route(`${authHost}/auth/v1/logout**`, (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route(`${authHost}/auth/v1/user`, (route) =>
    route.fulfill({ json: sessionFor().user }),
  );
  await page.route(`${authHost}/rest/v1/aircraft_favorites**`, (route) => {
    const request = route.request(),
      url = new URL(request.url());
    db.requests.push(request.method());
    const owner = url.searchParams.get("user_id")?.replace("eq.", "");
    const hex = url.searchParams.get("aircraft_hex")?.replace("eq.", "");
    if (request.method() === "GET")
      return route.fulfill({
        json: db.rows.filter((row) => row.user_id === owner),
      });
    if (db.failWrite)
      return route.fulfill({
        status: 503,
        json: { message: "Temporarily unavailable" },
      });
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      const row: Favorite = {
        ...(Array.isArray(body) ? body[0] : body),
        created_at: new Date().toISOString(),
      };
      db.rows.push(row);
      return route.fulfill({ status: 201, json: row });
    }
    if (request.method() === "DELETE") {
      const deleted = db.rows.filter(
        (row) => row.user_id === owner && row.aircraft_hex === hex,
      );
      db.rows = db.rows.filter((row) => !deleted.includes(row));
      return route.fulfill({
        json: deleted.map((row) => ({ aircraft_hex: row.aircraft_hex })),
      });
    }
    return route.fulfill({ status: 405 });
  });
  return db;
}
async function selectAircraft(page: Page) {
  await page.locator("#live-tab").click();
  await page
    .getByRole("button", { name: "Acompanhar TAM1234", exact: true })
    .click();
  await expect(page.locator(".aircraft-details")).toBeVisible();
}
const favorite: Favorite = {
  user_id: userId,
  aircraft_hex: "abc123",
  registration: "PT-ABC",
  aircraft_type: "A320",
  created_at: new Date().toISOString(),
};

test("Google inicia OAuth com PKCE sem gravar favoritos anônimos", async ({
  page,
}) => {
  const db = await mockBackend(page);
  await page.route(`${authHost}/auth/v1/authorize**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>OAuth test boundary</p>",
    }),
  );
  await page.goto("/");
  await selectAircraft(page);
  await page
    .getByRole("button", { name: "Salvar nos favoritos", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Sua conta é criada no primeiro acesso.",
  );
  await page.getByRole("button", { name: "Entrar com Google" }).click();
  await page.waitForURL(`${authHost}/auth/v1/authorize**`);
  const url = new URL(page.url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toContain(
    "http://127.0.0.1:4173/",
  );
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(url.searchParams.get("code_challenge_method")?.toLowerCase()).toBe(
    "s256",
  );
  expect(db.requests).not.toContain("POST");
});

test("retorno OAuth troca o código, restaura a sessão e limpa a URL", async ({
  page,
}) => {
  await mockBackend(page);
  await page.addInitScript(
    (key) =>
      localStorage.setItem(
        `${key}-code-verifier`,
        JSON.stringify("test-pkce-verifier"),
      ),
    storageKey,
  );
  let exchanged = false;
  await page.route(`${authHost}/auth/v1/token?grant_type=pkce`, (route) => {
    const body = route.request().postDataJSON();
    exchanged =
      body.auth_code === "test-code" &&
      body.code_verifier === "test-pkce-verifier";
    return route.fulfill({ json: sessionFor() });
  });
  await page.goto("/?code=test-code");
  await page
    .getByRole("button", { name: "Conta e favoritos", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Ana Teste");
  await expect(page).not.toHaveURL(/code=/);
  expect(exchanged).toBe(true);
});

test("salva no banco, persiste após recarregar, abre e remove favoritos", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const db = await mockBackend(page);
  await seedSession(page);
  await page.goto("/");
  await selectAircraft(page);
  await page
    .getByRole("button", { name: "Salvar nos favoritos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remover dos favoritos", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(db.rows).toHaveLength(1);
  expect(db.rows[0].user_id).toBe(userId);
  await page.reload();
  await page
    .getByRole("button", { name: "Conta e favoritos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Abrir aeronave PT-ABC" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/account-desktop.png" });
  await page.getByRole("button", { name: "Abrir aeronave PT-ABC" }).click();
  await expect(page.locator(".aircraft-details-header")).toContainText(
    "PT-ABC",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Conta e favoritos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remover PT-ABC dos favoritos" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Você ainda não tem favoritos.",
  );
  expect(db.rows).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("sair limpa dados da conta e o celular permite entrar novamente", async ({
  page,
}) => {
  await mockBackend(page, [favorite]);
  await seedSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Conta", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir aeronave PT-ABC" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/account-mobile.png" });
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar com Google" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText("PT-ABC");
  await expect(page.getByRole("dialog")).not.toContainText("ana@example.test");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Conta", exact: true }),
  ).toBeFocused();
});

test("falha de gravação não marca favorito e permite recuperar", async ({
  page,
}) => {
  const db = await mockBackend(page);
  db.failWrite = true;
  await seedSession(page);
  await page.goto("/");
  await selectAircraft(page);
  await page
    .getByRole("button", { name: "Salvar nos favoritos", exact: true })
    .click();
  await expect(page.locator(".favorite-action")).toContainText(
    "Não foi possível alterar os favoritos",
  );
  expect(db.rows).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Salvar nos favoritos", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  db.failWrite = false;
  await page
    .getByRole("button", { name: "Atualizar favoritos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar nos favoritos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remover dos favoritos", exact: true }),
  ).toBeVisible();
});

test("mudança de conta não reapresenta favoritos do usuário anterior", async ({
  page,
}) => {
  await mockBackend(page, [favorite]);
  await seedSession(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Conta e favoritos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Abrir aeronave PT-ABC" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar com Google" }),
  ).toBeVisible();
  await page.evaluate(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: storageKey, session: sessionFor(otherUserId) },
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Conta e favoritos", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Bia Teste");
  await expect(page.getByRole("dialog")).not.toContainText("PT-ABC");
  await expect(page.getByRole("dialog")).toContainText(
    "Você ainda não tem favoritos.",
  );
});

test("cancelamento do Google informa falha sem expor o texto recebido", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto("/?error=access_denied&error_description=untrusted-message");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText("untrusted-message");
  await expect(page).not.toHaveURL(/error=/);
});

test("abrir favorito distante centraliza o mapa na posição atual do avião", async ({ page }) => {
  await mockBackend(page, [favorite]);
  await seedSession(page);
  await page.route('**/v2/hex/abc123', route => route.fulfill({json:{ac:[{
    hex:'abc123', r:'PT-ABC', t:'A320', flight:'TAM1234',
    lat:-22.9, lon:-43.2, alt_baro:10000, track:90, seen_pos:1,
  }]}}));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await expect.poll(() => page.locator('html').getAttribute('data-airport-traffic-received-at')).not.toBeNull();
  await page.getByRole('button',{name:'Conta e favoritos',exact:true}).click();
  await page.getByRole('button',{name:'Abrir aeronave PT-ABC'}).click();
  await expect(page.locator('#status')).toContainText('Acompanhando');
  await expect(async () => {
    const marker = await page.locator('.aircraft-marker').boundingBox();
    const canvas = await page.locator('.maplibregl-canvas').boundingBox();
    expect(marker).not.toBeNull();expect(canvas).not.toBeNull();
    expect(Math.abs(marker!.x + marker!.width / 2 - (canvas!.x + canvas!.width / 2))).toBeLessThan(3);
    expect(Math.abs(marker!.y + marker!.height / 2 - (canvas!.y + canvas!.height / 2))).toBeLessThan(3);
  }).toPass({timeout:10000});
});

test("favorito sem sinal atual informa indisponibilidade sem mostrar posição antiga", async ({ page }) => {
  await mockBackend(page, [favorite]);
  await seedSession(page);
  await page.route('**/v2/hex/abc123', route => route.fulfill({json:{ac:[{
    hex:'abc123', lat:-22.9, lon:-43.2, seen_pos:120,
  }]}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Conta e favoritos',exact:true}).click();
  await page.getByRole('button',{name:'Abrir aeronave PT-ABC'}).click();
  await expect(page.locator('#status')).toContainText('posição ao vivo indisponível');
  await expect(page.locator('.aircraft-marker')).toBeHidden();
});
