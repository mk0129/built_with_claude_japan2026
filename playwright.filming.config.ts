import { defineConfig } from "@playwright/test";

/**
 * 撮影条件の E2E（`npm run e2e:filming`）。撮影用サーバーと同じ設定で、新しい一時 DB の専用サーバー（3150）を起動する。
 * - 基準日 2026-11-04（DEMO_ANCHOR）・記録済みの Claude 出力の再生・日本時間（TZ）・API キーは空（Claude を呼ばない・課金なし）
 * - 撮影の主要な流れ（患者ホーム・診断時セット・理解確認・体調記録・QR 共有・Claude外来間サマリー・根拠・情報処方・共有終了）を確認する
 */
const PORT = process.env.E2E_FILMING_PORT ?? "3150";

export default defineConfig({
  testDir: "tests/e2e-filming",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    screenshot: "off",
    video: "off",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `REVIEW_DIST=.next-e2e-filming sh scripts/review/serve.sh ${PORT} 5450`,
    url: `http://localhost:${PORT}/staff/login`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
