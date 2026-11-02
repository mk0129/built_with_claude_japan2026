#!/usr/bin/env node
/**
 * E2E 専用サーバー: 実行ごとに新しい一時 DB（架空データのみ）を作り、ポート 3100 で起動する。
 * 開発用 DB（.data/）や開発サーバー（3000）には触れないため、過去の学習履歴に依存しない。
 *   E2E_CLAUDE=fake（既定）: API キーを空にして擬似生成。外部送信も課金もしない
 *   E2E_CLAUDE=real        : .env.local の ANTHROPIC_API_KEY で実際の Claude API を呼ぶ
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = process.env.E2E_PORT || "3100";
const DB_PORT = process.env.E2E_DB_PORT || "5434";
const dir = mkdtempSync(join(tmpdir(), "shiori-e2e-db-"));
const mode = process.env.E2E_CLAUDE === "real" ? "real" : "fake";
const env = {
  ...process.env,
  LOCAL_DB_DIR: dir,
  LOCAL_DB_PORT: DB_PORT,
  NEXT_DIST_DIR: ".next-e2e",
  BETTER_AUTH_URL: `http://localhost:${PORT}`,
  NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
  SEED_DEMO_HISTORY: process.env.SEED_DEMO_HISTORY ?? "1",
};
if (mode === "fake") Object.assign(env, { ANTHROPIC_API_KEY: "", CLAUDE_FAKE: "1" });
else delete env.CLAUDE_FAKE;
console.log(`[e2e] fresh db ${dir} / port ${PORT} / claude=${mode}`);

const setup = spawnSync("node", ["scripts/with-local-db.mjs", "tsx", "--env-file-if-exists=.env.local", "src/server/db/setup.ts"], { stdio: "inherit", env });
if (setup.status !== 0) process.exit(setup.status ?? 1);

const child = spawn("node", ["scripts/with-local-db.mjs", "next", "dev", "-p", PORT], { stdio: "inherit", env });
const cleanup = () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
};
child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
