/**
 * 2026-11-08 の挿絵・サムネイルの一括取り込み（docs/design/illustration_batch_20261108/prompts.json の一覧に沿って）。
 *   npx tsx scripts/assets/import-illustrations.mts <受け取ったフォルダ>
 * フォルダには一覧の id をファイル名にした PNG/JPG（例: EDI-SE-02.png, THUMB-neuropathy.png）を置く。
 * - サムネイル（線画）: 白い背景を透明にし、1600×1200 の WebP と 192px の PNG（public/thumbnails/small）に書き出す。
 *   登録は src/concept-d/thumbnails.ts の THUMBNAILS に追記する行を標準出力に出す（自動では書き換えない）
 * - 挿絵（editorial）: 幅 1200px の PNG にし public/assets/editorial/ に置く。白い背景は淡くぼかした透明に。
 *   seed-figures.ts へ追記する TypeScript と、公開デモの patient-figures.json への追記を書き出す
 * 画像の中身（文字・医学的に不適切な表現）は目で確認する。登録前にこのスクリプトは何も消さない。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp, { type Sharp } from "sharp";

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error("usage: import-illustrations.mts <folder>");
  process.exit(2);
}
type Item = { id: string; kind: "editorial" | "thumbnail" | "cover"; materialTitle?: string; setName?: string; slideSeq?: number; slideTitle?: string; sceneJa: string; filename: string };
const manifest = JSON.parse(readFileSync("docs/design/illustration_batch_20261108/prompts.json", "utf8")) as { items: Item[] };
const files = readdirSync(dir);
const findFile = (id: string) => files.find((f) => f.replace(/\.(png|jpg|jpeg|webp)$/i, "").toLowerCase() === id.toLowerCase());

/** 白い背景を透明にする（線画・水彩とも白地に描かれている前提。近白ほど透明、暗いほど不透明） */
async function keyOutWhite(input: Buffer, soft: number): Promise<Sharp> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    // soft 以上はほぼ白 → 透明。soft-40〜soft で徐々に不透明に
    const a = lum >= soft ? 0 : lum <= soft - 40 ? 255 : Math.round(((soft - lum) / 40) * 255);
    px[i + 3] = Math.min(px[i + 3], a);
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } });
}

mkdirSync("public/thumbnails/small", { recursive: true });
mkdirSync("public/assets/editorial", { recursive: true });
mkdirSync("public/covers", { recursive: true });
const coverLines: string[] = [];
const thumbLines: string[] = [];
const figureEntries: string[] = [];
const demoFigures: Record<string, Record<string, unknown[]>> = {};
let done = 0;
for (const it of manifest.items) {
  const f = findFile(it.id);
  if (!f) continue;
  const input = readFileSync(path.join(dir, f));
  if (it.kind === "thumbnail") {
    const keyed = await keyOutWhite(input, 235);
    const fitted = keyed.resize(1600, 1200, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
    await fitted.clone().webp({ quality: 90, alphaQuality: 90 }).toFile(`public/thumbnails/${it.filename}`);
    await sharp(await fitted.png().toBuffer()).resize(192, 144, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(`public/thumbnails/small/${it.filename.replace(/\.webp$/, ".png")}`);
    thumbLines.push(`  "${it.materialTitle}": { file: "${it.filename}", alt: "${it.sceneJa}の線画" },`);
  } else if (it.kind === "cover") {
    const keyed = await keyOutWhite(input, 235);
    await keyed.resize(800, 1000, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90, alphaQuality: 90 }).toFile(`public/covers/${it.filename}`);
    coverLines.push(`  "${it.setName}": { file: "${it.filename}", alt: "${it.sceneJa}の線画" },`);
  } else {
    const out = `public/assets/editorial/${it.filename}`;
    const keyed = await keyOutWhite(input, 250);
    const img = keyed.resize({ width: 1200, withoutEnlargement: true }).png({ compressionLevel: 9 });
    const info = await img.toFile(out);
    const alt = `${it.sceneJa.replace(/。$/, "")}のイラスト`;
    figureEntries.push(`  {
    assetId: "${it.id}",
    type: "editorial",
    altText: "${alt}",
    longDescription: "${it.sceneJa}",
    learningObjective: "医学的知識は説明しない。教材「${it.materialTitle}」の場面を伝える装飾",
    placements: [{ materialTitle: "${it.materialTitle}", slideSeq: ${it.slideSeq}, labels: [], caption: null }],
    delivered: { filename: "${it.filename}", width: ${info.width}, height: ${info.height} },
  },`);
    const mt = it.materialTitle ?? "";
    ((demoFigures[mt] ??= {})[String(it.slideSeq)] ??= []).push({ src: `/assets/editorial/${it.filename}`, altText: alt, caption: null, longDescription: it.sceneJa, width: info.width, height: info.height, type: "editorial" });
  }
  done++;
}
const outDir = "docs/design/illustration_batch_20261108/generated";
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/thumbnails.registry.txt`, thumbLines.join("\n") + "\n");
writeFileSync(`${outDir}/covers.registry.txt`, coverLines.join("\n") + "\n");
writeFileSync(`${outDir}/seed-figures.entries.txt`, figureEntries.join("\n") + "\n");
writeFileSync(`${outDir}/patient-figures.additions.json`, JSON.stringify(demoFigures, null, 1));
console.log(`processed ${done} files. thumbnails ${thumbLines.length}, covers ${coverLines.length}, editorial ${figureEntries.length}. See ${outDir}/`);
