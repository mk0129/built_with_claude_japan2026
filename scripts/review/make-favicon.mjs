#!/usr/bin/env node
/**
 * 採用ロゴ A からファビコンを作る。32px 以上は正式マーク（public/brand/shiori_mark.png）を縮小して正方形の中央に置くだけ、
 * 16・24px は細部を減らした小サイズ用（public/brand/shiori_mark_small.svg）を使う。
 *   node scripts/review/make-favicon.mjs → src/app/favicon.ico（16/24/32/48）、src/app/apple-icon.png（180、生成り地）
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const SRC = "public/brand/shiori_mark.png";
const SMALL = "public/brand/shiori_mark_small.svg";
const square = async (size, bg) => {
  const mark = await sharp(size < 32 ? SMALL : SRC, { density: 600 }).resize({ height: Math.round(size * (bg ? 0.78 : 1)), kernel: "lanczos3" }).png().toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark.data, left: Math.round((size - mark.info.width) / 2), top: Math.round((size - mark.info.height) / 2) }])
    .png()
    .toBuffer();
};
const sizes = [16, 24, 32, 48];
const pngs = await Promise.all(sizes.map((s) => square(s)));
// ICO（PNG 埋め込み形式）
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e);
  head.writeUInt8(s, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([head, ...pngs]));
writeFileSync("src/app/apple-icon.png", await square(180, "#FAF8F3"));
console.log("favicon.ico", sizes.join("/"), "apple-icon.png 180");
