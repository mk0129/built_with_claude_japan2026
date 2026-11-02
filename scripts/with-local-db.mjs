#!/usr/bin/env node
/**
 * ローカル開発用: PGlite をソケットサーバーとして 1 プロセスで起動し、
 * DATABASE_URL を注入して任意のコマンドを実行する。コマンド終了でサーバーも終了する。
 *   node scripts/with-local-db.mjs next dev
 *   node scripts/with-local-db.mjs tsx src/server/db/setup.ts
 * Docker や psql がなくても Postgres 互換 DB で開発できる。本番は Supabase の DATABASE_URL を使う。
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const DATA_DIR = process.env.LOCAL_DB_DIR || ".data/shiori";
const PORT = Number(process.env.LOCAL_DB_PORT || 5433);
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: node scripts/with-local-db.mjs <command> [args...]");
  process.exit(2);
}

mkdirSync(DATA_DIR, { recursive: true });
// 前回の異常終了で残ったロックは除去する（単一プロセス運用なので安全）
const stalePid = `${DATA_DIR}/postmaster.pid`;
if (existsSync(stalePid)) rmSync(stalePid);

const db = new PGlite(DATA_DIR);
await db.waitReady;
const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: PORT, maxConnections: 8 });
await server.start();
const url = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
console.log(`[local-db] PGlite listening on ${url} (data: ${DATA_DIR})`);

const child = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, DATABASE_URL: url }, shell: process.platform === "win32" });
let shuttingDown = false;
async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await server.stop();
    await db.close();
  } catch {}
  process.exit(code);
}
child.on("exit", (code) => shutdown(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
    setTimeout(() => shutdown(0), 3000);
  });
}
