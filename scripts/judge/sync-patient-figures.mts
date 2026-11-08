/**
 * 公開デモの患者向けの図（.judge-demo/app/fixtures/patient-figures.json）を、DB のシード（src/server/db/seed-figures.ts）の
 * 納品済み挿絵（editorial。医学監修の対象外で、public/assets/editorial/ にあれば seed で approved になる）と同期する。
 *   npx tsx scripts/judge/sync-patient-figures.mts           … 追記・更新して保存
 *   npx tsx scripts/judge/sync-patient-figures.mts --check   … 保存せず、差分があれば終了コード 1
 * - 既存の医学図解（/assets/medical/。公開デモ用に承認済みの 3 枚）は順序も内容も変えない（type: "medical" だけ補う）
 * - 教材名 → ページ番号 → 図の配列へマージし、同じ src は 1 件だけ（再実行しても重複しない）。削除はしない
 * - 1 ページに医学図解と挿絵の両方があるときは医学図解を先に置く（患者画面は医学図解を優先して表示する）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { SEED_FIGURES } from "../../src/server/db/seed-figures";

type Figure = { src: string; altText: string; caption: string | null; longDescription: string | null; width: number; height: number; type?: "medical" | "editorial" };
type Fixture = Record<string, Record<string, Figure[]>>;

const file = ".judge-demo/app/fixtures/patient-figures.json";
const check = process.argv.includes("--check");
const before = readFileSync(file, "utf8");
const fixture = JSON.parse(before) as Fixture;

let added = 0;
let updated = 0;
for (const figures of Object.values(fixture))
  for (const list of Object.values(figures))
    for (const f of list) if (!f.type && f.src.startsWith("/assets/medical/")) { f.type = "medical"; updated++; }

for (const f of SEED_FIGURES) {
  if (f.type !== "editorial" || !f.delivered) continue;
  for (const p of f.placements) {
    const page = ((fixture[p.materialTitle] ??= {})[String(p.slideSeq)] ??= []);
    const next: Figure = { src: `/assets/editorial/${f.delivered.filename}`, altText: f.altText, caption: p.caption, longDescription: f.longDescription, width: f.delivered.width, height: f.delivered.height, type: "editorial" };
    const i = page.findIndex((x) => x.src === next.src);
    if (i === -1) { page.push(next); added++; }
    else if (JSON.stringify(page[i]) !== JSON.stringify(next)) { page[i] = next; updated++; }
    page.sort((a, b) => Number(a.type === "editorial") - Number(b.type === "editorial"));
  }
}

const after = JSON.stringify(fixture) + "\n";
const changed = after !== before;
if (check) {
  console.log(changed ? `差分あり（追加 ${added}・更新 ${updated}）: npx tsx scripts/judge/sync-patient-figures.mts を実行してください` : "差分なし");
  process.exit(changed ? 1 : 0);
}
if (changed) writeFileSync(file, after);
const total = Object.values(fixture).reduce((n, pages) => n + Object.values(pages).reduce((m, l) => m + l.length, 0), 0);
console.log(`${changed ? "保存しました" : "変更なし"}: 追加 ${added}・更新 ${updated}。教材 ${Object.keys(fixture).length} 本・図 ${total} 件`);
