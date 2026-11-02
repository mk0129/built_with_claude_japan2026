import { defineConfig } from "@playwright/test";

/**
 * E2E（ブラウザ通し検証）。`npm run dev`（ローカル PGlite）を起動した状態で `npm run e2e`。
 * スクリーンショットは docs/screenshots/day3/ に保存する。
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    screenshot: "off",
    video: "off",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
