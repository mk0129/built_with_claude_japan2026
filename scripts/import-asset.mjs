#!/usr/bin/env node
/**
 * 画像アセットの取り込み（ASSET_QA_AND_IMPORT.md の自動検査 + 配置 + 登録）。
 *   node scripts/with-local-db.mjs node scripts/import-asset.mjs <asset_id> <path/to/file.png> [--approve]
 * - PNG / サイズ / アルファ / 四隅の透過 / 白ハローの目安を検査
 * - public/assets/{medical|editorial}/<filename> にコピー
 * - figure_assets.filename / width / height を登録
 * - --approve: 情緒的イラスト（editorial）のみ即時 approved にできる。医学的図解（medical）は監修プレビューから承認する
 * 認証・採点・処方のロジックには触れない。
 */
import { readFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import postgres from "postgres";

const [assetId, file, ...flags] = process.argv.slice(2);
if (!assetId || !file) {
  console.error("usage: import-asset.mjs <asset_id> <file.png> [--approve]");
  process.exit(2);
}
const approve = flags.includes("--approve");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL が未設定です。`node scripts/with-local-db.mjs node scripts/import-asset.mjs ...` で実行してください。");
  process.exit(2);
}

// ---- PNG 検査（依存なしの最小デコーダ: IHDR と IDAT を読み、RGBA 8bit のみ対応） ----
const buf = readFileSync(file);
if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") fail("PNG ではありません");
let pos = 8;
let width = 0,
  height = 0,
  bitDepth = 0,
  colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.subarray(pos + 4, pos + 8).toString("ascii");
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === "IHDR") {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === "IDAT") idat.push(data);
  pos += 12 + len;
}
const report = { file: path.basename(file), width, height, bitDepth, colorType, alpha: colorType === 6 || colorType === 4, bytes: buf.length };
let cornersTransparent = null;
let haloRisk = null;
if (colorType === 6 && bitDepth === 8) {
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? line[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    line.copy(px, y * stride);
    prev = line;
  }
  const alphaAt = (x, y) => px[(y * width + x) * 4 + 3];
  const corners = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1], [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)],
  ];
  cornersTransparent = corners.every(([x, y]) => alphaAt(x, y) === 0);
  // 白ハロー: 半透明（1..254）画素の平均輝度
  let n = 0, lum = 0;
  for (let i = 0; i < width * height; i++) {
    const a = px[i * 4 + 3];
    if (a > 0 && a < 255) {
      n++;
      lum += 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    }
  }
  haloRisk = n ? Math.round(lum / n) >= 240 : false;
  Object.assign(report, { cornersTransparent, semiTransparentPixels: n, haloRisk });
}
console.log("検査結果:", report);
const warnings = [];
if (!report.alpha) warnings.push("アルファチャンネルがありません（透過 PNG が必要）");
if (cornersTransparent === false) warnings.push("四隅・辺の中点が透過ではありません（背景の白残りの可能性）");
if (haloRisk) warnings.push("半透明画素の輝度が高く、白ハローの可能性があります");
if (buf.length > 1_500_000) warnings.push("1.5MB を超えています。配信用に縮小を検討してください");
for (const w of warnings) console.warn("警告:", w);

// ---- 配置と登録 ----
const sql = postgres(url, { prepare: process.env.SHIORI_LOCAL_DB === "1", max: 1 });
const [asset] = await sql`select asset_id, type, review_status from figure_assets where asset_id = ${assetId}`;
if (!asset) fail(`figure_assets に ${assetId} がありません（db:setup 済みか確認）`);
const dir = path.join("public", "assets", asset.type);
mkdirSync(dir, { recursive: true });
const filename = `${assetId.toLowerCase().replace(/-/g, "_")}_${path.basename(file).replace(/^.*?_/, "").replace(/[^a-z0-9_.-]/gi, "_").toLowerCase()}`;
const dest = path.join(dir, filename);
copyFileSync(file, dest);
let status = asset.review_status;
if (approve) {
  if (asset.type !== "editorial") fail("医学的図解（medical）は監修プレビューから承認してください。--approve は editorial のみ");
  status = "approved";
}
await sql`update figure_assets set filename = ${filename}, width = ${width}, height = ${height}, review_status = ${status}, updated_at = now() where asset_id = ${assetId}`;
await sql.end();
console.log(`配置: ${dest}（${existsSync(dest) ? "OK" : "NG"}）, 登録: ${assetId} → ${filename}, review_status = ${status}`);

function fail(msg) {
  console.error("エラー:", msg);
  process.exit(1);
}
