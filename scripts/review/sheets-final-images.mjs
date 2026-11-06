/**
 * 正式イラストの比較シート（左: 画像なし／右: 画像あり）。
 * 入力: docs/review/final_images/before・after（scripts/review/capture-images-review.mjs。リポジトリには入れない）
 * 出力: docs/review/final_images/sheets/*.jpg・index.html
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = "docs/review/final_images";
mkdirSync(`${ROOT}/sheets`, { recursive: true });
const PAIRS = [
  ["P01_home", "患者ホーム（診断時セットのカバー）"],
  ["P02_set_detail", "診断時セットの内容（カバー・教材 3 件のサムネイル）"],
  ["P03_lesson_detail", "教材の詳細（低い横長の枠に切り抜き。「学習を始める」の位置）"],
  ["P04_library_all", "教材を探す・すべての公開教材"],
  ["P05_category", "個別教材の一覧（検査・診断）"],
  ["P05_category_mind", "個別教材の一覧（日常生活・相談支援）"],
  ["P06_home_money_card", "患者ホームの「仕事とお金のこと」"],
  ["P07_money", "仕事とお金のこと（カバー・医療費シミュレーターの入口。教材は準備中）"],
  ["P08_sim_start", "医療費シミュレーター（入口の次の画面。画像の変更なし）"],
  ["C01_library", "医療者の教材ライブラリ"],
  ["C02_library_search", "医療者の教材検索（こころ）"],
];
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
const url = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
const done = [];
for (const [base, title] of PAIRS) {
  for (const w of base.startsWith("C") ? ["1180"] : ["390", "430"]) {
    const id = `${base}_${w}`;
    const bf = `${ROOT}/before/${id}.png`, af = `${ROOT}/after/${id}.png`;
    if (!existsSync(bf) || !existsSync(af)) continue;
    const wide = w === "1180";
    await page.setViewportSize({ width: wide ? 1400 : 1000, height: 900 });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;background:#f4f6f6;color:#1f3237}
      h1{font-size:20px;margin:0 0 14px}.row{display:flex;gap:20px;align-items:flex-start;${wide ? "flex-direction:column" : ""}}
      figure{margin:0;flex:1;${wide ? "width:100%" : ""}}figcaption{font-weight:700;margin-bottom:6px}img{width:100%;border:1px solid #cfd8da;background:#fff}</style>
      <h1>${title}（${w}px）</h1><div class="row"><figure><figcaption>画像なし</figcaption><img src="${url(bf)}"></figure><figure><figcaption>画像あり</figcaption><img src="${url(af)}"></figure></div>`);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${ROOT}/sheets/${id}.jpg`, fullPage: true, type: "jpeg", quality: 78 });
    done.push({ id, title: `${title}（${w}px）` });
  }
}
await b.close();
writeFileSync(
  `${ROOT}/index.html`,
  `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>正式イラスト 比較</title>
<style>body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;margin:24px;color:#1f3237}h1{font-size:22px}section{margin:0 0 28px}h2{font-size:16px}img{max-width:100%;border:1px solid #dfe6e7}</style>
<h1>正式イラストの統合 — 画像なし／画像あり</h1><p>隔離 DB・架空データ（伊藤 涼子・佐藤 一郎）。詳細は README.md。</p>
${done.map((d) => `<section><h2>${d.title}</h2><img src="sheets/${d.id}.jpg" alt="${d.title}"></section>`).join("\n")}
</html>\n`,
);
console.log(`sheets ${done.length}`);
