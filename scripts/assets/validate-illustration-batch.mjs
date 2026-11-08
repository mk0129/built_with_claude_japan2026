#!/usr/bin/env node
/**
 * 2026-11-08 の教材イラスト 57 点（本文挿絵 29・教材サムネイル 22・セット表紙 6。縮小版 22 を含め 79 ファイル）の登録検証。読み取りだけで何も書き換えない。
 *   node scripts/assets/validate-illustration-batch.mjs                         … public/ の 79 ファイル（SHA-256・寸法・形式）と登録先を照合
 *   node scripts/assets/validate-illustration-batch.mjs --dist .judge-demo/dist   … 審査用ビルドの出力にも同じ 79 ファイルがあるか（SHA-256 一致）
 *   node scripts/assets/validate-illustration-batch.mjs --live https://…         … 公開 URL から 79 ファイルを取得し、画像としてデコードでき、寸法と SHA-256 が一致するか
 *                                                                                 （HTML の代替応答・古いキャッシュによる見かけ上の成功を検出）
 *   --report <file.json> … ID ごとの結果を JSON で保存（検証表の作成用）
 * 台帳: docs/design/illustration_batch_20261108/delivery_manifest.json（配置一覧.csv・制作台帳.json から作成。SHA-256・寸法は納品物の値）
 * 登録先: src/concept-d/thumbnails.ts（THUMBNAILS・SET_COVERS）、src/server/db/seed-figures.ts（editorial の配置）、
 *         .judge-demo/app/fixtures/patient-figures.json（公開デモの図）、.judge-demo/app/fixtures/lessons.json（教材名・ページ見出し）、
 *         .judge-demo/app/fixtures/consultation.json と src/server/db/seed-content.ts（セット名）、seed-data.ts ほか（教材名）
 * 57 ID すべてが合格のとき終了コード 0。欠落・SHA-256 不一致・二重登録・大文字小文字違い・別の教材への登録があれば 1。
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const live = opt("--live");
const dist = opt("--dist");
const report = opt("--report");

const manifest = JSON.parse(readFileSync("docs/design/illustration_batch_20261108/delivery_manifest.json", "utf8"));
const src = (f) => readFileSync(f, "utf8");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- 登録先を読む ----
const thumbsTs = src("src/concept-d/thumbnails.ts");
const registry = (name) => {
  const block = thumbsTs.match(new RegExp(`export const ${name}[^=]*= \\{([\\s\\S]*?)\\n\\};`))?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)": \{ file: "([^"]+)"/g)].map((m) => ({ key: m[1], file: m[2] }));
};
const REG = { THUMBNAILS: registry("THUMBNAILS"), SET_COVERS: registry("SET_COVERS") };
const seedFigures = src("src/server/db/seed-figures.ts");
const seedBlocks = seedFigures.split(/\n  \{\n/).slice(1);
const patientFigures = JSON.parse(src(".judge-demo/app/fixtures/patient-figures.json"));
const lessonByTitle = new Map(Object.values(JSON.parse(src(".judge-demo/app/fixtures/lessons.json"))).map((l) => [l.title, l]));
const consultation = JSON.parse(src(".judge-demo/app/fixtures/consultation.json"));
const demoTemplates = new Set(consultation.templates.templates.map((t) => t.name));
const seedTitles = new Set(
  ["src/server/db/seed-data.ts", "src/server/db/seed-content-social.ts", "src/server/db/seed-content-more.ts"].flatMap((f) =>
    [...src(f).matchAll(/\{ title: "([^"]+)", primaryDomain/g)].map((m) => m[1]),
  ),
);
const templateNames = new Set([...src("src/server/db/seed-content.ts").matchAll(/\{ name: "([^"]+)", description/g)].map((m) => m[1]));
const learningTs = src("src/concept-d/learning.ts");
const patientSetName = (name) => learningTs.match(new RegExp(`(?:^|[\\s{])${escapeRe(name)}: "([^"]+)"`))?.[1] ?? name;
const allDemoFigureSrcs = Object.values(patientFigures).flatMap((pages) => Object.values(pages).flatMap((list) => list.map((f) => f.src)));

// ---- 公開 URL ----
const nonce = Date.now().toString(36);
async function fetchLive(url) {
  const u = new URL(url, live);
  u.searchParams.set("verify", nonce);
  const res = await fetch(u, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get("content-type") ?? "", cache: res.headers.get("x-vercel-cache") ?? "", age: res.headers.get("age") ?? "", buf };
}
let liveCommit = null;
if (live) {
  try {
    liveCommit = JSON.parse((await fetchLive("/judge-release.json")).buf.toString("utf8")).commit;
  } catch (e) {
    console.error(`judge-release.json を取得できません: ${e.message}`);
  }
}

// ---- 検証 ----
const rows = [];
const kinds = { editorial: 0, thumbnail: 0, cover: 0 };
for (const item of manifest.items) {
  kinds[item.kind]++;
  const problems = [];
  const files = [];
  for (const f of item.files) {
    const r = { url: f.url, local: "未確認", dist: dist ? "未確認" : "—", live: live ? "未確認" : "—" };
    const base = path.basename(f.path);
    if (!/^[a-z0-9_]+\.(png|webp)$/.test(base)) problems.push(`ファイル名 ${base}（英小文字・数字・_ と .png/.webp）`);
    if (!existsSync(f.path)) {
      problems.push(`欠落 ${f.path}`);
      r.local = "欠落";
    } else {
      const buf = readFileSync(f.path);
      const meta = await sharp(buf).metadata();
      const ok = sha256(buf) === f.sha256 && meta.format === f.format && meta.width === f.width && meta.height === f.height;
      if (sha256(buf) !== f.sha256) problems.push(`SHA-256 不一致 ${f.path}`);
      if (meta.format !== f.format || meta.width !== f.width || meta.height !== f.height) problems.push(`形式・寸法 ${meta.format} ${meta.width}×${meta.height}（期待 ${f.format} ${f.width}×${f.height}）`);
      r.local = ok ? "一致" : "不一致";
      const twins = readdirSync(path.dirname(f.path)).filter((n) => n.toLowerCase() === base.toLowerCase());
      if (twins.length !== 1) problems.push(`大文字小文字違いの同名ファイル ${twins.join(", ")}`);
    }
    if (dist) {
      const d = path.join(dist, f.url);
      if (!existsSync(d)) {
        problems.push(`ビルド出力に欠落 ${d}`);
        r.dist = "欠落";
      } else {
        r.dist = sha256(readFileSync(d)) === f.sha256 ? "一致" : "不一致";
        if (r.dist !== "一致") problems.push(`ビルド出力の SHA-256 不一致 ${d}`);
      }
    }
    if (live) {
      try {
        const res = await fetchLive(f.url);
        const looksHtml = /^\s*</.test(res.buf.subarray(0, 64).toString("utf8"));
        let decoded = null;
        try {
          decoded = await sharp(res.buf).metadata();
        } catch {
          decoded = null;
        }
        const same = sha256(res.buf) === f.sha256;
        const dims = decoded && decoded.format === f.format && decoded.width === f.width && decoded.height === f.height;
        if (res.status !== 200) problems.push(`公開 URL ${f.url}: HTTP ${res.status}`);
        else if (looksHtml || !res.type.startsWith("image/")) problems.push(`公開 URL ${f.url}: 画像でない応答（${res.type || "content-type なし"}）`);
        else if (!decoded) problems.push(`公開 URL ${f.url}: 画像としてデコードできない`);
        else if (!dims) problems.push(`公開 URL ${f.url}: 寸法・形式が違う（${decoded.format} ${decoded.width}×${decoded.height}）`);
        else if (!same) problems.push(`公開 URL ${f.url}: 内容が納品物と違う（古いキャッシュまたは別ファイル）`);
        r.live = res.status === 200 && !looksHtml && decoded && dims && same ? "一致" : "不一致";
        r.liveDetail = `HTTP ${res.status} ${res.type}${res.cache ? ` cache=${res.cache}` : ""}${decoded ? ` ${decoded.format} ${decoded.width}×${decoded.height}` : ""}`;
      } catch (e) {
        problems.push(`公開 URL ${f.url}: 取得失敗 ${e.message}`);
        r.live = "取得失敗";
      }
    }
    files.push(r);
  }

  let registered = "";
  if (item.kind === "editorial") {
    const blocks = seedBlocks.filter((b) => b.includes(`assetId: "${item.id}"`));
    const base = path.basename(item.files[0].path);
    if (blocks.length !== 1) problems.push(`seed-figures.ts に ${item.id} が ${blocks.length} 件`);
    else {
      const b = blocks[0];
      if (!b.includes('type: "editorial"')) problems.push("seed-figures.ts の type が editorial でない");
      if (!b.includes(`materialTitle: "${item.materialTitle}", slideSeq: ${item.slideSeq},`)) problems.push("seed-figures.ts の配置（教材・ページ）が台帳と違う");
      if (!b.includes(`filename: "${base}"`)) problems.push("seed-figures.ts のファイル名が違う");
      if ((b.match(/materialTitle:/g) ?? []).length !== 1) problems.push("seed-figures.ts の配置が 1 件でない");
    }
    if ((seedFigures.match(new RegExp(`filename: "${escapeRe(base)}"`, "g")) ?? []).length !== 1) problems.push("seed-figures.ts に同じファイルの登録が複数");
    if (!seedTitles.has(item.materialTitle)) problems.push("教材名が DB のシードにない");
    const lesson = lessonByTitle.get(item.materialTitle);
    if (!lesson) problems.push("教材名が公開デモの lessons.json にない");
    else {
      const slide = lesson.slides.find((s) => s.seq === item.slideSeq);
      if (!slide) problems.push(`lessons.json に ${item.slideSeq} ページがない`);
      else if (slide.title !== item.slideTitle) problems.push(`lessons.json の見出し「${slide.title}」が台帳「${item.slideTitle}」と違う`);
    }
    const page = patientFigures[item.materialTitle]?.[String(item.slideSeq)] ?? [];
    const hits = page.filter((f) => f.src === item.files[0].url);
    if (hits.length !== 1) problems.push(`patient-figures.json の ${item.materialTitle} ${item.slideSeq} ページに ${hits.length} 件`);
    else if (hits[0].type !== "editorial" || hits[0].width !== item.files[0].width || hits[0].height !== item.files[0].height) problems.push("patient-figures.json の type・寸法が違う");
    if (allDemoFigureSrcs.filter((s) => s === item.files[0].url).length !== 1) problems.push("patient-figures.json に同じ画像が複数箇所");
    registered = `seed-figures ${item.materialTitle} p${item.slideSeq} / patient-figures.json`;
  } else {
    const reg = item.kind === "thumbnail" ? REG.THUMBNAILS : REG.SET_COVERS;
    const base = path.basename(item.files[0].path);
    const byFile = reg.filter((e) => e.file === base);
    const byKey = reg.filter((e) => e.key === item.key);
    if (byFile.length !== 1) problems.push(`thumbnails.ts に ${base} の登録が ${byFile.length} 件`);
    else if (byFile[0].key !== item.key) problems.push(`thumbnails.ts のキー「${byFile[0].key}」が台帳「${item.key}」と違う`);
    if (byKey.length !== 1) problems.push(`thumbnails.ts にキー「${item.key}」が ${byKey.length} 件`);
    if (item.kind === "thumbnail") {
      if (!seedTitles.has(item.key)) problems.push("教材名が DB のシードにない");
      if (!lessonByTitle.has(item.key)) problems.push("教材名が公開デモの lessons.json にない");
      registered = `THUMBNAILS["${item.key}"]`;
    } else {
      if (!templateNames.has(item.key) && ![...templateNames].some((n) => patientSetName(n) === item.key)) problems.push("セット名が seed-content.ts のテンプレートにない");
      if (!demoTemplates.has(item.key)) problems.push("セット名が公開デモの consultation.json のテンプレートにない");
      registered = `SET_COVERS["${item.key}"]`;
    }
  }
  rows.push({ id: item.id, kind: item.kind, target: item.materialTitle ?? item.setName, slideSeq: item.slideSeq ?? null, slideTitle: item.slideTitle ?? null, alt: item.alt, registered, files, problems });
}

// ---- 台帳そのものの前提 ----
const structural = [];
if (manifest.items.length !== 57) structural.push(`台帳の ID 数 ${manifest.items.length}（57 が必要）`);
if (kinds.editorial !== 29 || kinds.thumbnail !== 22 || kinds.cover !== 6) structural.push(`内訳 本文 ${kinds.editorial}／サムネイル ${kinds.thumbnail}／表紙 ${kinds.cover}`);
const fileCount = manifest.items.reduce((n, i) => n + i.files.length, 0);
if (fileCount !== 79) structural.push(`ファイル数 ${fileCount}（79 が必要）`);
const urls = manifest.items.flatMap((i) => i.files.map((f) => f.url));
if (new Set(urls).size !== urls.length) structural.push("台帳に同じ配信パスが複数");
if (new Set(urls.map((u) => u.toLowerCase())).size !== urls.length) structural.push("台帳に大文字小文字違いの配信パス");
// 新しい 22 点のサムネイルは 1 件ずつ別のファイル（既存の thumb_symptom_check のような共用はしない）
const newThumbFiles = manifest.items.filter((i) => i.kind === "thumbnail").map((i) => path.basename(i.files[0].path));
for (const f of newThumbFiles) if (REG.THUMBNAILS.filter((e) => e.file === f).length > 1) structural.push(`${f} が複数の教材に登録`);

// ---- 出力 ----
const pad = (s, n) => String(s).padEnd(n);
if (live) console.log(`公開 URL: ${live}（配信中のコミット ${liveCommit ?? "不明"}）`);
for (const r of rows) {
  const status = r.problems.length ? "不合格" : "合格";
  const where = r.kind === "editorial" ? `${r.target} ${r.slideSeq}ページ「${r.slideTitle}」` : r.target;
  const fileState = r.files.map((f) => `${path.basename(f.url)}: local ${f.local}${dist ? ` / dist ${f.dist}` : ""}${live ? ` / live ${f.live}` : ""}`).join("; ");
  console.log(`${pad(status, 4)} ${pad(r.id, 30)} ${pad(r.kind, 9)} ${where}｜${fileState}${r.problems.length ? `｜${r.problems.join(" / ")}` : ""}`);
}
for (const s of structural) console.log(`不合格 台帳: ${s}`);
const failed = rows.filter((r) => r.problems.length).length + structural.length;
const okFiles = rows.flatMap((r) => r.files).filter((f) => f.local === "一致" && (!dist || f.dist === "一致") && (!live || f.live === "一致")).length;
console.log(`ID: 合格 ${rows.length - rows.filter((r) => r.problems.length).length}／不合格 ${rows.filter((r) => r.problems.length).length}（本文 ${kinds.editorial}・サムネイル ${kinds.thumbnail}・表紙 ${kinds.cover}）。ファイル: ${okFiles}／${fileCount} が一致${live ? "（公開 URL を含む）" : ""}`);
if (report) {
  writeFileSync(report, JSON.stringify({ checkedAt: new Date().toISOString(), live, liveCommit, dist, rows, structural }, null, 1) + "\n");
  console.log(`結果を保存: ${report}`);
}
process.exit(failed ? 1 : 0);
