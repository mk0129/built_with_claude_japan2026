#!/usr/bin/env node
/** compare.mjs の結果から、画面ごとに「左 Figma｜右 shiori」を並べた一覧画像（JPEG）を作る。各画面の先頭（スクロール 0）だけ。 */
import sharp from "sharp";
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const IN = process.env.IN ?? "docs/design/concept_d/compare";
const OUT = process.env.OUT ?? "docs/design/concept_d/sheets";
mkdirSync(OUT, { recursive: true });
const files = readdirSync(join(IN, "figma")).filter((f) => !/_s\d+\.png$/.test(f)).sort();
const groups = { patient_390: /^P.*_390\.png$/, patient_430: /^P.*_430\.png$/, clinician_1180: /^C.*_1180\.png$/, clinician_820: /^C.*_820\.png$/ };
for (const [name, re] of Object.entries(groups)) {
  const list = files.filter((f) => re.test(f));
  const scale = name.startsWith("patient") ? 0.5 : 0.36;
  const meta = await sharp(join(IN, "figma", list[0])).metadata();
  const w = Math.round(meta.width * scale), h = Math.round(meta.height * scale);
  const cols = name.startsWith("patient") ? 3 : 2;
  const cellW = 2 * w + 12, cellH = h + 26;
  const rows = Math.ceil(list.length / cols);
  const comps = [];
  for (const [i, f] of list.entries()) {
    const x = (i % cols) * (cellW + 24), y = Math.floor(i / cols) * (cellH + 16);
    for (const [j, side] of ["figma", "shiori"].entries()) {
      comps.push({ input: await sharp(join(IN, side, f)).resize(w, h).toBuffer(), left: x + j * (w + 12), top: y + 22 });
    }
    const label = `${f.replace(".png", "")}   左: Figma Make / 右: shiori`;
    comps.push({ input: Buffer.from(`<svg width="${cellW}" height="20"><text x="0" y="15" font-family="sans-serif" font-size="13" fill="#243a3d">${label}</text></svg>`), left: x, top: y });
  }
  await sharp({ create: { width: cols * (cellW + 24), height: rows * (cellH + 16), channels: 3, background: "#ffffff" } })
    .composite(comps)
    .jpeg({ quality: 78 })
    .toFile(join(OUT, `${name}.jpg`));
  console.log(name, list.length);
}
