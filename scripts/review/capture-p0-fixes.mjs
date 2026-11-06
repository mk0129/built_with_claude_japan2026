/**
 * P0 修正の変更前後の比較シート（架空データ。Claude は呼ばない）。
 * - 変更後の画面: E2E（tests/e2e/demo_p0.spec.ts、P0_SHOT_DIR=docs/review/p0_fixes/after）で撮ったもの＋このスクリプトで撮る入口・共有中の画面
 * - 変更前の画面: docs/review/final_ui_review/shots（読み取りのみ）
 * - 出力: docs/review/p0_fixes/sheets/*.jpg と index.html
 *
 * 使い方: 隔離した確認用サーバー（例: sh scripts/review/serve.sh 3170 5470）を起動してから
 *   BASE=http://localhost:3170 node scripts/review/capture-p0-fixes.mjs
 * 3900 の撮影環境には接続しない（BASE に 3900 を指定すると中止）。
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3170";
if (/:3900\b/.test(BASE)) throw new Error("3900 の撮影環境には接続しません");
const ROOT = "docs/review/p0_fixes";
const AFTER = `${ROOT}/after`;
const BEFORE = "docs/review/final_ui_review/shots";
const SHEETS = `${ROOT}/sheets`;
mkdirSync(AFTER, { recursive: true });
mkdirSync(SHEETS, { recursive: true });

const ctxOpts = (vp) => ({ baseURL: BASE, viewport: vp, locale: "ja-JP", timezoneId: "Asia/Tokyo", deviceScaleFactor: 1, reducedMotion: "reduce" });

const browser = await chromium.launch();
try {
  // 入口（改行の位置）
  for (const vp of [
    { name: "390", width: 390, height: 844 },
    { name: "430", width: 430, height: 932 },
  ]) {
    const ctx = await browser.newContext(ctxOpts(vp));
    const p = await ctx.newPage();
    await p.goto("/");
    await p.waitForLoadState("networkidle");
    await p.screenshot({ path: `${AFTER}/E01_entry_${vp.name}.png` });
    await ctx.close();
  }

  // 患者の共有中の画面（共有先の氏名の改行）: 患者が 6 桁コードを表示 → 医療者が入力 → 患者が承認
  const pc = await browser.newContext(ctxOpts({ width: 390, height: 844 }));
  const sc = await browser.newContext(ctxOpts({ width: 1180, height: 820 }));
  const p = await pc.newPage();
  const s = await sc.newPage();
  await p.goto("/login");
  await p.getByRole("button", { name: /伊藤 涼子/ }).first().click();
  await p.waitForURL(/\/home/);
  await s.goto("/staff/login");
  await s.getByRole("button", { name: /佐藤 一郎/ }).first().click();
  await s.waitForURL(/\/staff/);
  await p.goto("/home?view=share");
  await p.locator("[data-share-issue]").click();
  const code = ((await p.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
  await s.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力|新しく接続を申請/ }).click();
  await s.locator(".cd-code-panel input").fill(code);
  await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await p.locator("[data-share-request]").waitFor({ timeout: 15_000 });
  await p.locator(".d-consent input").check();
  await p.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await p.getByRole("heading", { name: /と一時共有中です/ }).waitFor({ timeout: 15_000 });
  await p.screenshot({ path: `${AFTER}/P21_sharing_390.png` });
  // 終了（API の拒否は E2E で確認済み）
  await s.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
  await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await s.locator("[data-share-ended]").waitFor();
  await pc.close();
  await sc.close();

  // 比較シート（左: 変更前／右: 変更後）
  const PAIRS = [
    { id: "P08_result_390", title: "P0-1 理解確認の結果「学んだ教材」", before: "P08_quiz_result_390.png", after: "P08_result_390.png", note: "変更前は「学習を記録しました」なのに 0。変更後は DB と同じ件数（再読み込み後も同じ）" },
    { id: "P08_result_error_390", title: "P0-1 記録を確認できないとき（新規）", before: null, after: "P08_result_error_390.png", note: "一覧の読み込みに失敗したときは成功の印・「学習を記録しました」を出さず、再確認のボタン" },
    { id: "P12_sim_result_390", title: "P0-2 シミュレーターの結果（390px）", before: "P12_sim_result_390.png", after: "P12_sim_result_manual_390.png", note: "変更前は入力画面のスクロール位置のまま開き、金額が画面の上に隠れる。変更後は先頭から（手入力）" },
    { id: "P12_sim_result_demo_390", title: "P0-2 架空の例で試す（390px）", before: null, after: "P12_sim_result_demo_390.png", note: "架空の例も先頭から。金額・意味・確定額ではない旨・計算の条件が初期表示で読める" },
    { id: "P12_sim_result_430", title: "P0-2 シミュレーターの結果（430px）", before: "P12_sim_result_430.png", after: "P12_sim_result_manual_430.png", note: "430px も先頭から" },
    { id: "C13_share_ended_1180", title: "P0-3 医療者の共有終了（1180px）", before: "C13_after_end_1180.png", after: "C13_share_ended_1180.png", note: "変更前はチェックの印つきで「有効な診察セッションがありません」。変更後は終了完了の画面（追加入力なし）" },
    { id: "C13_end_failed_1180", title: "P0-3 終了に失敗したとき（新規）", before: null, after: "C13_end_failed_1180.png", note: "通信エラーでは共有中のまま、失敗の通知（成功の印は出さない）" },
    { id: "P01_home_set_kept_390", title: "P0-4 別の教材を追加処方したあとのホーム（390px）", before: "P01_home_390.png", after: "P01_home_set_kept_390.png", note: "変更前（左は追加処方の前の画面）: 追加処方のあとはセットのカードが消えていた。変更後はセットが残り、新しい教材は別に案内" },
    { id: "P01_home_set_kept_430", title: "P0-4 別の教材を追加処方したあとのホーム（430px）", before: "P01_home_430.png", after: "P01_home_set_kept_430.png", note: "送り元・日付はセットを含む処方の記録。「今回の」とは書かない" },
    { id: "E01_entry_390", title: "P1 入口の見出しの改行（390px）", before: "E01_entry_390.png", after: "E01_entry_390.png", note: "「自分のペー／ス」→ 句読点の位置で改行" },
    { id: "E01_entry_430", title: "P1 入口の見出しの改行（430px）", before: "E01_entry_430.png", after: "E01_entry_430.png", note: "「で。」だけが 2 行目に残らない" },
    { id: "P07_quiz_unknown_390", title: "P1 「わからない」を記録しました の改行", before: "P07_quiz_unknown_390.png", after: "P07_quiz_unknown_390.png", note: "「た」1 文字の改行 → 「「わからない」を／記録しました」" },
    { id: "P21_sharing_390", title: "P1 共有先の氏名の改行", before: "P21_sharing_390.png", after: "P21_sharing_390.png", note: "「佐／藤 医師」→ 医療機関名と氏名の間で改行" },
  ];
  const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  const sheetPage = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 })).newPage();
  const rows = [];
  for (const pair of PAIRS) {
    const b = pair.before ? path.join(BEFORE, pair.before) : null;
    const a = path.join(AFTER, pair.after);
    if (!existsSync(a) || (b && !existsSync(b))) {
      console.warn(`skip ${pair.id}（画像がありません）`);
      continue;
    }
    const cell = (label, file) =>
      `<figure><figcaption>${label}</figcaption>${file ? `<img src="${dataUrl(file)}">` : `<div class="none">（変更前は該当の画面なし）</div>`}</figure>`;
    await sheetPage.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;background:#f4f6f6;color:#1f3237}
      h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;font-size:14px;color:#4a5b60}
      .row{display:flex;gap:20px;align-items:flex-start}figure{margin:0;flex:1}figcaption{font-weight:700;margin-bottom:6px}
      img{width:100%;border:1px solid #cfd8da;background:#fff}.none{padding:60px 0;text-align:center;border:1px dashed #b9c4c5;color:#6b7b80}
    </style><h1>${pair.title}</h1><p>${pair.note}</p><div class="row">${cell("変更前", b)}${cell("変更後", a)}</div>`);
    await sheetPage.waitForTimeout(100);
    await sheetPage.screenshot({ path: `${SHEETS}/${pair.id}.jpg`, fullPage: true, type: "jpeg", quality: 82 });
    rows.push(pair);
  }
  writeFileSync(
    `${ROOT}/index.html`,
    `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P0修正 変更前後</title>
<style>body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;margin:24px;background:#fff;color:#1f3237}h1{font-size:22px}section{margin:0 0 32px}h2{font-size:16px;margin:0 0 4px}p{margin:0 0 8px;color:#4a5b60}img{max-width:100%;border:1px solid #dfe6e7}</style>
<h1>デモ撮影直前の P0 修正 — 変更前後</h1><p>架空データ。左が変更前（docs/review/final_ui_review）、右が変更後。</p>
${rows.map((r) => `<section><h2>${r.title}</h2><p>${r.note}</p><img src="sheets/${r.id}.jpg" alt="${r.title}"></section>`).join("\n")}
</html>\n`,
  );
  console.log(`sheets: ${rows.length}`);
} finally {
  await browser.close();
}
