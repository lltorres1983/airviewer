import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command:
      "npm run build:test && npm run preview -- --outDir ../.test-dist --port 4173",
    env: {
      VITE_SUPABASE_URL: "https://airviewer-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_airviewer_e2e_key",
    },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
