#!/usr/bin/env node
/**
 * 正式画像の受け入れ検証（登録はしない。読み取りだけ）。
 *   node scripts/assets/validate-images.mjs                 … public/ に置かれた画像と、thumbnails.ts の登録を検証
 *   node scripts/assets/validate-images.mjs --dir <フォルダ>  … 受け取った画像（public に置く前）を検証
 *
 * 一覧: docs/design/final_assets/manifest.json
 * 確認すること
 *   - キー: THUMBNAILS は DB の教材名（seed-data.ts の DEMO_MATERIALS・socialSupport.ts の MONEY_TITLES）と完全一致、
 *           SET_COVERS は患者向けのセット名（learning.ts の PATIENT_SET_NAME・MONEY_THEME）、THEME_IMAGES はテーマ名（SIMULATOR_NAME）
 *   - ファイル: 名前（英小文字・数字・_・.webp）、WebP、サイズ（thumbnail 1600×1200、cover/theme 800×1000 またはその 2 倍）
 *   - 画風: 透明背景（アルファあり・透明な画素が 50% 以上）、描かれた画素の 95% 以上が #315E68 に近い（単色の線画）
 *   - 登録: thumbnails.ts の辞書に登録済みか、登録されたファイル名が一覧と一致するか
 * 未着の画像は「未着」と表示するだけ（失敗にしない）。届いた画像が仕様に合わない・キーが一致しないときは終了コード 1。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const dirArg = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : null;
const manifest = JSON.parse(readFileSync("docs/design/final_assets/manifest.json", "utf8"));
const LINE = [0x31, 0x5e, 0x68];

// ---- 正しいキー（コードから読む） ----
const src = (f) => readFileSync(f, "utf8");
const seedTitles = [...src("src/server/db/seed-data.ts").matchAll(/\{ title: "([^"]+)", primaryDomain/g)].map((m) => m[1]);
const social = src("src/concept-d/socialSupport.ts");
const moneyTitles = JSON.parse(social.match(/MONEY_TITLES = (\[[^\]]+\])/)[1]);
const moneyTheme = social.match(/MONEY_THEME = "([^"]+)"/)[1];
const simulatorName = social.match(/SIMULATOR_NAME = "([^"]+)"/)[1];
const learning = src("src/concept-d/learning.ts");
const patientSetNames = [...learning.matchAll(/(\S+): "([^"]+)"/g)].filter((m) => /セット/.test(m[1])).map((m) => m[2]);
const templateNames = [...src("src/server/db/seed-content.ts").matchAll(/\{ name: "([^"]+)", description/g)].map((m) => m[1]);
const v11Titles = manifest.assets.filter((a) => /v1\.1/.test(a.source)).map((a) => a.key);
const validKeys = {
  thumbnail: new Set([...seedTitles, ...moneyTitles, ...v11Titles]),
  cover: new Set([...patientSetNames, ...templateNames.filter((n) => !/^初回診断時セット$/.test(n)), moneyTheme]),
  theme: new Set([simulatorName, moneyTheme]),
};

// ---- thumbnails.ts の登録 ----
const thumbsTs = src("src/concept-d/thumbnails.ts");
const registry = (name) => {
  const block = thumbsTs.match(new RegExp(`export const ${name}[^=]*= \\{([\\s\\S]*?)\\n\\};`))?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/"([^"]+)": \{ file: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
};
const REG = { THUMBNAILS: registry("THUMBNAILS"), SET_COVERS: registry("SET_COVERS"), THEME_IMAGES: registry("THEME_IMAGES") };

async function inspect(file) {
  const meta = await sharp(file).metadata();
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, opaque = 0, near = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) { transparent++; continue; }
    opaque++;
    if (Math.abs(data[i] - LINE[0]) + Math.abs(data[i + 1] - LINE[1]) + Math.abs(data[i + 2] - LINE[2]) < 90) near++;
  }
  return { format: meta.format, width: meta.width, height: meta.height, hasAlpha: !!meta.hasAlpha, transparentPct: (100 * transparent) / (transparent + opaque), linePct: opaque ? (100 * near) / opaque : 0 };
}

const rows = [];
let failed = 0;
for (const a of manifest.assets) {
  const kind = manifest.kinds[a.kind];
  const problems = [];
  if (!validKeys[a.kind].has(a.key)) problems.push(`キーがコードの名前と一致しない（${a.kind}）`);
  if (!/^[a-z0-9_]+\.webp$/.test(a.file)) problems.push("ファイル名は英小文字・数字・_ と .webp");
  const regFile = REG[kind.registry][a.key];
  const registered = regFile ? (regFile === a.file ? "登録済み" : `登録済み（別のファイル ${regFile}）`) : "未登録";
  const file = dirArg ? path.join(dirArg, a.file) : path.join(kind.dir, a.file);
  let status = "未着";
  let detail = "";
  if (existsSync(file)) {
    const r = await inspect(file);
    const scales = kind.allowScale ?? [1];
    if (r.format !== kind.format) problems.push(`形式 ${r.format}（${kind.format} が必要）`);
    if (!scales.some((s) => r.width === kind.width * s && r.height === kind.height * s)) problems.push(`サイズ ${r.width}×${r.height}（${scales.map((s) => `${kind.width * s}×${kind.height * s}`).join(" または ")}）`);
    if (!r.hasAlpha || r.transparentPct < 50) problems.push(`透明背景でない（透明 ${r.transparentPct.toFixed(1)}%）`);
    if (r.linePct < 95) problems.push(`単色の線画でない（#315E68 に近い画素 ${r.linePct.toFixed(1)}%）`);
    status = problems.length ? "不合格" : "合格";
    detail = `${r.width}×${r.height}・透明 ${r.transparentPct.toFixed(0)}%・線色 ${r.linePct.toFixed(0)}%`;
  }
  if (problems.length && (status !== "未着" || problems.some((p) => p.startsWith("キー") || p.startsWith("ファイル名")))) failed++;
  rows.push({ status, priority: a.priority, kind: a.kind, key: a.key, file: a.file, registered, detail, problems: problems.join(" / ") });
}

// 一覧にない登録（キーの書き間違い・古い登録）
for (const [name, reg] of Object.entries(REG))
  for (const key of Object.keys(reg))
    if (!manifest.assets.some((a) => manifest.kinds[a.kind].registry === name && a.key === key)) {
      failed++;
      rows.push({ status: "一覧外の登録", priority: "", kind: name, key, file: reg[key], registered: "登録済み", detail: "", problems: "manifest.json にない" });
    }

const pad = (s, n) => String(s).padEnd(n);
console.log(`検証先: ${dirArg ?? "public/"}（${rows.length} 件）`);
for (const r of rows) console.log(`${pad(r.status, 6)} ${pad(r.priority, 14)} ${pad(r.kind, 9)} ${r.key} → ${r.file}｜${r.registered}${r.detail ? `｜${r.detail}` : ""}${r.problems ? `｜${r.problems}` : ""}`);
const count = (s) => rows.filter((r) => r.status === s).length;
console.log(`合格 ${count("合格")}・不合格 ${count("不合格")}・未着 ${count("未着")}・一覧外の登録 ${count("一覧外の登録")}`);
process.exit(failed ? 1 : 0);
