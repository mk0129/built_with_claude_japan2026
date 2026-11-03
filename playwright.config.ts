import { defineConfig } from "@playwright/test";

/**
 * E2E（ブラウザ通し検証）。`npm run e2e` で一時 DB の専用サーバー（3100）を起動して実行する。
 * 実 API で生成を検証する場合は `npm run e2e:real`（API キーが必要。課金が発生する）。
 * スクリーンショットは docs/screenshots/day3/ に保存する。
 */
const PORT = process.env.E2E_PORT ?? "3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    screenshot: "off",
    video: "off",
    trace: "retain-on-failure",
  },
  // 実行ごとに新しい一時 DB で専用サーバーを起動する（開発 DB の学習履歴に依存しない）
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}/staff/login`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
