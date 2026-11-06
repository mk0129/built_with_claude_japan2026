#!/usr/bin/env node
/**
 * 撮影リハーサル（録画の順番どおりに操作して、各シーンを撮る。Claude は呼ばない）。
 *   BASE: 撮影と同じ条件の隔離サーバー（sh scripts/review/serve.sh <port> <dbPort>: 新しい一時 DB・基準日 2026-11-04・記録済み Claude 出力の再生・API キーなし）
 *         3900 の撮影環境には接続しない（指定すると中止）
 *   OUT : 出力先（既定 docs/review/video_rehearsal）。shots/*.png・checks.json・index.html
 *
 * 2 人の架空患者を混同しない:
 *   伊藤 涼子 … 患者ホーム・診断時セット・学習・理解確認（わからない）・診察で聞きたいこと・仕事とお金のこと・シミュレーター・体調記録の入力
 *   佐藤 花子 … 体調の経過グラフ・QR 共有・承認・Claude外来間サマリー（再生）・元記録・在宅経過表（記録は追加・変更しない）
 *   情報処方の確定は、佐藤 花子の共有を終えてから伊藤 涼子と共有し直して行う（佐藤 花子の記録を変えない）
 * 日時入力の表記は、撮影に使う日本語のブラウザに合わせて --lang=ja-JP で起動したブラウザで撮る（比較用に既定のブラウザでも 1 枚）。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { prepIto } from "../demo/prep-filming.mjs";

const B = process.env.BASE ?? "http://localhost:3270";
if (/:3900\b/.test(B)) throw new Error("3900 の撮影環境には接続しません");
const OUT = process.env.OUT ?? "docs/review/video_rehearsal";
mkdirSync(`${OUT}/shots`, { recursive: true });
const VP = { 390: { width: 390, height: 844 }, 430: { width: 430, height: 932 } };
const STAFF_VP = { width: 1180, height: 820 };

const shots = [];
const checks = [];
const errors = {};
const check = (scene, item, ok, detail = "") => checks.push({ scene, item, ok: !!ok, detail });

// 撮影用のブラウザ（日本語の UI。日時入力などのブラウザ標準の部品が日本語の書式になる）
const b = await chromium.launch({ args: ["--lang=ja-JP"] });
await prepIto(b, B);
const ctxOpts = (vp) => ({ baseURL: B, viewport: vp, locale: "ja-JP", timezoneId: "Asia/Tokyo", deviceScaleFactor: 2, reducedMotion: "reduce" });
async function login(kind, name, vp, browser = b) {
  const ctx = await browser.newContext(ctxOpts(vp));
  const p = await ctx.newPage();
  await p.goto(B + (kind === "patient" ? "/login" : "/staff/login"));
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 });
  return p;
}
// QR・6 桁コード・コード入力欄は塗りつぶす
const secrets = (p) => [p.locator('img[src^="data:image"]'), p.locator("[data-share-code] b"), p.locator(".cd-code-panel input")];
async function shot(p, id, label, scene, opts = {}) {
  await p.waitForTimeout(400);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/shots/${id}.png`, fullPage: opts.fullPage ?? false, mask: secrets(p), maskColor: "#c9d6d8" });
  shots.push({ id, label, scene });
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    errors[name] = String(e).split("\n")[0];
    console.log("ERR", name, errors[name]);
  }
}
/** 要素の先頭が画面（ビューポート）の中に見えているか */
const inView = (loc) =>
  loc.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < window.innerHeight - 8 && r.bottom > 0;
  });
const mainScrollToBottom = (p) => p.locator("main.d-main").evaluate((el) => (el.scrollTop = el.scrollHeight));
/** 1180px の録画で読みにくい小さな文字（12px 未満）の数と例 */
const smallText = (p, root) =>
  p.evaluate((sel) => {
    const out = [];
    const rootEl = document.querySelector(sel) ?? document.body;
    for (const el of [rootEl, ...rootEl.querySelectorAll("p,span,small,b,li,dt,dd,td,th,button,label,text")]) {
      const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
      if (!t) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12) out.push(`${fs}px「${t.slice(0, 24)}」`);
    }
    return out;
  }, root);

// ===== 1〜5. 伊藤 涼子: ホーム → 診断時セット → 学習 → 理解確認（わからない）→ 診察で聞きたいこと =====
for (const [w, vp] of Object.entries(VP)) {
  const a = await login("patient", "伊藤 涼子", vp);
  const S = (n) => `${n}_${w}`;
  await step(S("01_home"), async () => {
    await a.locator("[data-set-card]").waitFor({ timeout: 15_000 });
    await shot(a, S("01_home"), `患者ホーム（伊藤 涼子） ${w}`, "1 患者ホーム");
    check("1 患者ホーム", `${w}px: 診断時セットのカードが最初の画面に見える`, await inView(a.locator("[data-set-card]")));
    check("1 患者ホーム", `${w}px: 社会制度の教材を公開済みに見せない（ホームに教材名を出さない）`, !(await a.locator(".d-home").textContent()).includes("傷病手当金を知る"));
  });
  await step(S("02_set"), async () => {
    await a.locator("[data-set-open]").click();
    await a.locator("[data-set-detail]").waitFor();
    await shot(a, S("02_set"), `診断時セットの内容 ${w}`, "2 診断時セット");
  });
  await step(S("03_learn"), async () => {
    await a.locator("[data-set-lesson]").filter({ hasText: "乳がんの診断と病期の考え方" }).click();
    await a.locator(".d-detail").waitFor();
    await shot(a, S("03_detail"), `教材の詳細 ${w}`, "3 教材学習");
    await a.locator(".d-detail .d-bottom-action").click();
    // 本文の読み込みを待つ（「読み込んでいます…」の間は撮らない）
    await a.locator(".d-learning h1").filter({ hasNotText: "読み込んでいます" }).waitFor();
    await a.locator(".d-learning-head").filter({ hasText: /1 \/ \d/ }).waitFor();
    await shot(a, S("03_learn_p1"), `学習 1ページ目 ${w}`, "3 教材学習");
    // 「もう少し詳しく」を開いて下までスクロールしてから「次へ」→ 次のページの見出しが見えるか
    const more = a.locator(".d-disclosure").first();
    if (await more.count()) {
      await more.click();
      await shot(a, S("03_learn_more"), `学習・もう少し詳しく ${w}`, "3 教材学習", { fullPage: true });
    }
    await mainScrollToBottom(a);
    await a.getByRole("button", { name: "次へ" }).click();
    await a.locator(".d-learning-head").filter({ hasText: /2 \/ \d/ }).waitFor();
    await a.waitForTimeout(400);
    check("3 教材学習", `${w}px: 下までスクロールして「次へ」→ 次のページの見出しが見える`, await inView(a.locator(".d-learning h1")));
    check("3 教材学習", `${w}px: 「次へ」のボタンが画面内`, await inView(a.locator(".d-learning-actions .primary-button")));
    for (let i = 0; i < 8; i++) {
      const t = await a.locator(".d-learning-actions .primary-button").textContent();
      if (t?.includes("理解を確認する")) break;
      await a.getByRole("button", { name: "次へ" }).click();
    }
  });
  await step(S("04_quiz"), async () => {
    await a.getByRole("button", { name: "理解を確認する" }).click();
    await a.locator(".d-answer-list").waitFor();
    check("4 理解確認", `${w}px: 問題文が見える`, await inView(a.locator(".d-quiz h1")));
    await shot(a, S("04_quiz_q1"), `理解確認（1問目） ${w}`, "4 理解確認");
    await a.locator(".d-answer-list button").filter({ hasText: "わからない" }).click();
    check("4 理解確認", `${w}px: 「この回答で確定する」が画面内`, await inView(a.getByRole("button", { name: "この回答で確定する" })));
    await a.getByRole("button", { name: "この回答で確定する" }).click();
    await a.getByRole("heading", { name: /「わからない」を\s*記録しました/ }).waitFor();
    check("4 理解確認", `${w}px: 「わからない」を記録しました の見出しが見える`, await inView(a.getByRole("heading", { name: /「わからない」を\s*記録しました/ })));
    await shot(a, S("04_quiz_unknown"), `「わからない」を記録しました ${w}`, "4 理解確認");
  });
  await step(S("05_note"), async () => {
    await a.goto(B + "/home");
    const input = a.locator("[data-home-note-input]");
    await input.waitFor();
    await input.fill(w === "390" ? "病期の検査は、いつ・どんな順番で受けますか？" : "サブタイプは、どの検査でわかりますか？");
    await input.scrollIntoViewIfNeeded();
    await shot(a, S("05_note_input"), `診察で聞きたいこと（入力） ${w}`, "5 診察ノート");
    await a.getByRole("button", { name: /^追加$|追加/ }).first().click();
    await a.waitForTimeout(500);
    await a.goto(B + "/home?view=notes");
    await a.waitForLoadState("networkidle");
    await shot(a, S("05_notes"), `診察ノート ${w}`, "5 診察ノート");
  });
  // ===== 6・7. 仕事とお金のこと → 医療費シミュレーター =====
  await step(S("06_money"), async () => {
    await a.goto(B + "/home");
    await a.locator("[data-money-card]").click();
    await a.locator("[data-money-theme]").waitFor();
    await shot(a, S("06_money"), `仕事とお金のこと ${w}`, "6 仕事とお金のこと");
    const t = await a.locator("[data-money-theme]").textContent();
    check("6 仕事とお金のこと", `${w}px: 社会制度の教材は「準備中」で、公開済みのリンクがない`, (await a.locator("[data-money-pending]").count()) > 0 && (await a.locator("[data-money-theme] .d-lesson-card").count()) === 0, t?.slice(0, 60));
  });
  await step(S("07_sim"), async () => {
    await a.locator("[data-simulator-open]").click();
    await a.locator("[data-sim]").waitFor();
    await shot(a, S("07_sim_start"), `医療費シミュレーター（はじめ） ${w}`, "7 医療費シミュレーター");
    await mainScrollToBottom(a);
    await a.locator("[data-sim-demo]").click();
    await a.locator("[data-sim-result]").waitFor();
    check("7 医療費シミュレーター", `${w}px: 架空の例の結果の金額が最初の画面に見える`, await inView(a.locator("[data-sim-amount]")));
    await shot(a, S("07_sim_result"), `シミュレーター結果（架空の例 92,940円） ${w}`, "7 医療費シミュレーター");
    await a.getByRole("button", { name: "医療費を変えて計算する" }).click();
    check("7 医療費シミュレーター", `${w}px: 医療費の入力欄が見える`, await inView(a.locator("[data-sim-cost-input]")));
    await a.locator("[data-sim-cost-input]").fill("2000000");
    await mainScrollToBottom(a);
    await a.locator("[data-sim-calc]").click();
    await a.locator("[data-sim-amount]").waitFor();
    check("7 医療費シミュレーター", `${w}px: 手入力（200万円）の結果の金額が最初の画面に見える`, await inView(a.locator("[data-sim-amount]")), await a.locator("[data-sim-amount]").textContent());
    await shot(a, S("07_sim_result2"), `シミュレーター結果（200万円 102,940円） ${w}`, "7 医療費シミュレーター");
  });
  // ===== 8. 体調記録（伊藤 涼子の今日の入力。日時の表記）=====
  await step(S("08_health"), async () => {
    await a.goto(B + "/home");
    await a.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
    const dt = a.locator(".d-measured-at input");
    await dt.waitFor();
    await shot(a, S("08_health_input"), `体調記録（今日の記録・日本語のブラウザ） ${w}`, "8 体調記録");
    check("8 体調記録", `${w}px: 測定日時の入力欄が最初の画面に見える`, await inView(dt));
  });
  await a.context().close();
}
// 比較: 既定（英語 UI）のヘッドレスブラウザでの日時入力の表記
await step("08_health_default_browser", async () => {
  const b2 = await chromium.launch();
  const a = await login("patient", "伊藤 涼子", VP[390], b2);
  await a.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
  await a.locator(".d-measured-at input").waitFor();
  await a.waitForTimeout(400);
  await a.locator(".d-measured-at").screenshot({ path: `${OUT}/shots/08_health_datetime_default_browser.png` });
  await b2.close();
  const p = await login("patient", "伊藤 涼子", VP[390]);
  await p.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
  await p.locator(".d-measured-at input").waitFor();
  await p.waitForTimeout(400);
  await p.locator(".d-measured-at").screenshot({ path: `${OUT}/shots/08_health_datetime_ja_browser.png` });
  await p.context().close();
  shots.push({ id: "08_health_datetime_ja_browser", label: "測定日時（日本語のブラウザ）", scene: "8 体調記録" });
  shots.push({ id: "08_health_datetime_default_browser", label: "測定日時（比較: 既定の英語のヘッドレスブラウザ）", scene: "8 体調記録" });
});

// ===== 8b〜15. 佐藤 花子（閲覧と共有だけ）＋ 医療者 =====
const s = await login("staff", "佐藤 一郎", STAFF_VP);
for (const [w, vp] of Object.entries(VP)) {
  const h = await login("patient", "佐藤 花子", vp);
  await step(`08b_chart_${w}`, async () => {
    await h.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
    await h.getByRole("button", { name: "履歴・グラフ" }).click();
    await h.waitForTimeout(600);
    await shot(h, `08b_chart_${w}`, `体調の経過グラフ（佐藤 花子・別の架空患者） ${w}`, "8 体調記録");
  });
  if (w === "430") {
    await step("09_qr_430", async () => {
      await h.goto(B + "/home?view=share");
      await h.locator(".d-share-page").waitFor();
      await mainScrollToBottom(h);
      await h.locator("[data-share-issue]").click();
      await h.locator("[data-share-code]").waitFor();
      check("9 患者QR", "430px: QR と 6 桁コードが最初の画面に見える", (await inView(h.locator('img[src^="data:image"]'))) && (await inView(h.locator("[data-share-code]"))));
      await shot(h, "09_qr_430", "患者QR・6桁コード（塗りつぶし） 430", "9 患者QR");
      await h.getByRole("button", { name: /取り消す/ }).first().click();
    });
  }
  await h.context().close();
}
const h = await login("patient", "佐藤 花子", VP[390]);
let sidHanako = null;
await step("09_15_share_hanako", async () => {
  await h.goto(B + "/home?view=share");
  await h.locator(".d-share-page").waitFor();
  await shot(h, "09_share_start_390", "共有（はじめ・佐藤 花子） 390", "9 患者QR");
  await mainScrollToBottom(h);
  await h.locator("[data-share-issue]").click();
  await h.locator("[data-share-code]").waitFor();
  check("9 患者QR", "390px: 下までスクロールしてから表示 → QR と 6 桁コードが見える", (await inView(h.locator('img[src^="data:image"]'))) && (await inView(h.locator("[data-share-code]"))));
  await shot(h, "09_qr_390", "患者QR・6桁コード（塗りつぶし） 390", "9 患者QR");
  const code = ((await h.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
  await s.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力/ }).click();
  await shot(s, "10_read_1180", "医療者: 患者QRの読み取り／6桁コード入力", "10 医療者の読み取り");
  await s.locator(".cd-code-panel input").fill(code);
  await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await s.getByRole("heading", { name: "患者の承認を待っています" }).waitFor();
  await shot(s, "10_waiting_1180", "医療者: 患者の承認待ち", "10 医療者の読み取り");
  await h.locator("[data-share-request]").waitFor({ timeout: 15_000 });
  check("11 患者承認", "390px: 承認の申請が画面に見える", await inView(h.locator("[data-share-request]")));
  await shot(h, "11_approve_390", "患者の承認（申請者・共有範囲・60分）", "11 患者承認", { fullPage: true });
  await h.locator(".d-consent input").check();
  check("11 患者承認", "390px: 「この医療者に共有を許可する」が押せる位置", await inView(h.getByRole("button", { name: "この医療者に共有を許可する" })).catch(() => false));
  await h.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await s.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
  await h.getByRole("heading", { name: /と一時共有中です/ }).waitFor();
  // 残り時間: 患者と医療者で同じ分数（開始直後は 60 分）
  const pMin = (await h.locator(".d-share-session").textContent()).match(/(\d+)分/)?.[1];
  const sMin = (await s.locator(".cd-remaining").first().textContent()).match(/(\d+)分/)?.[1];
  check("11 患者承認", "共有開始直後の残り時間が患者と医療者で同じ（60分）", pMin === sMin && pMin === "60", `患者 ${pMin}分・医療者 ${sMin}分`);
  await shot(h, "11_sharing_390", "共有中（患者）", "11 患者承認");
  sidHanako = (await (await s.request.get("/api/v1/staff/live")).json()).activeSessionId;
});
await step("12_summary", async () => {
  await s.locator("[data-intervisit]").getByText("記録済みのClaude出力を再生", { exact: false }).first().waitFor({ timeout: 30_000 });
  await shot(s, "12_summary_1180", "Claude外来間サマリー（要点3項目）", "12 Claude外来間サマリー");
  await shot(s, "12_summary_full_1180", "診察サマリー（全体）", "12 Claude外来間サマリー", { fullPage: true });
  const key = s.locator("[data-key-summary]");
  const keyText = (await key.textContent()) ?? "";
  check("12 Claude外来間サマリー", "要点に「わからない」と回答した内容が出る（佐藤 花子の記録）", /わからない/.test(keyText));
  check("12 Claude外来間サマリー", "「1/4」の表記の説明がある", await s.locator("[data-severity-legend]").isVisible());
  check("12 Claude外来間サマリー", "要点がサマリーの最初の画面に見える", await inView(key));
  const small = [...(await smallText(s, ".cd-summary-title b")), ...(await smallText(s, "[data-severity-legend]")), ...(await smallText(s, "[data-key-summary]"))];
  check("12 Claude外来間サマリー", "1180px: 再生の表示・「1/4」の説明・要点 3 項目に 12px 未満の文字がない", small.length === 0, small.slice(0, 8).join(" / "));
  // 理解確認（わからない）の欄
  const und = s.locator(".cd-understanding");
  if (await und.count()) {
    await und.scrollIntoViewIfNeeded();
    await shot(s, "12_understanding_1180", "理解確認の欄（わからない・誤答）", "12 Claude外来間サマリー");
    check("12 Claude外来間サマリー", "理解確認の欄に「わからない」の回答が出る", /わからない/.test((await und.textContent()) ?? ""));
  }
});
await step("13_sources", async () => {
  const unknownItem = s.locator("[data-key-row] [data-summary-key-item]").filter({ hasText: "わからない" }).first();
  const target = (await unknownItem.count()) ? unknownItem : s.locator("[data-summary-key-item]").first();
  await target.scrollIntoViewIfNeeded();
  await target.click();
  const src = s.locator("[data-summary-sources]");
  await src.waitFor();
  await src.scrollIntoViewIfNeeded();
  await shot(s, "13_sources_1180", "要点（わからない）から元記録を開く", "13 元記録の確認");
  const small = await smallText(s, "[data-summary-sources]");
  check("13 元記録の確認", "1180px: 元記録の欄に 12px 未満の文字がない", small.length === 0, small.slice(0, 8).join(" / "));
  await s.locator("[data-summary-key-item]").first().scrollIntoViewIfNeeded();
  await s.locator("[data-summary-key-item]").first().click();
  await s.locator("[data-summary-sources]").waitFor();
  await s.locator("[data-summary-sources]").scrollIntoViewIfNeeded();
  await shot(s, "13_sources_symptom_1180", "要点（症状の経過）から元記録を開く", "13 元記録の確認");
});
await step("13b_course", async () => {
  await s.locator(".cd-sidebar").getByRole("button", { name: "在宅経過" }).click();
  await s.getByRole("heading", { name: "在宅経過表" }).waitFor();
  await s.waitForTimeout(600);
  await shot(s, "13b_course_1180", "在宅経過表", "13 元記録の確認");
  const small = (await smallText(s, ".cd-course-table-wrap")).filter((x) => parseFloat(x) < 11);
  check("13 元記録の確認", "1180px: 在宅経過表の表の中に 11px 未満の文字がない（曜日は 11px）", small.length === 0, `${small.length}件: ${small.slice(0, 6).join(" / ")}`);
});
await step("15a_end_hanako", async () => {
  await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await s.locator("[data-share-ended]").waitFor();
  check("15 共有終了", "佐藤 花子の共有終了 → 終了完了の画面", true);
  if (sidHanako) check("15 共有終了", "終了後の患者情報は 403", (await s.request.get(`/api/v1/consultations/${sidHanako}/patient`)).status() === 403);
  await s.locator("[data-share-ended]").getByRole("button", { name: "ホームへ戻る" }).click();
});
await h.context().close();

// ===== 14. 情報処方（伊藤 涼子と共有し直して確定。佐藤 花子の記録は変えない）=====
const it = await login("patient", "伊藤 涼子", VP[390]);
await step("14_rx", async () => {
  await it.goto(B + "/home?view=share");
  await it.locator("[data-share-issue]").click();
  const code = ((await it.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
  await s.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力|新しく接続を申請/ }).click();
  await s.locator(".cd-code-panel input").fill(code);
  await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await it.locator("[data-share-request]").waitFor({ timeout: 15_000 });
  await it.locator(".d-consent input").check();
  await it.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await s.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
  await shot(s, "14_summary_ito_1180", "診察サマリー（伊藤 涼子・Claude要約の再生対象ではない）", "14 情報処方");
  await s.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  await s.locator(".cd-library-grid").waitFor();
  await shot(s, "14_library_1180", "教材ライブラリ（セットから選ぶ・教材カード）", "14 情報処方");
  check("14 情報処方", "社会制度の教材が医療者の教材ライブラリに出ない（未公開）", !(/傷病手当金を知る|高額療養費制度を知る/.test((await s.locator(".cd-library-grid").textContent()) ?? "")));
  const card = s.locator(".cd-library-grid article").filter({ hasText: "化学療法中の副作用とセルフケア" }).first();
  await card.getByRole("button", { name: "処方に追加" }).click();
  await s.getByRole("button", { name: /選択中 1件/ }).click();
  await shot(s, "14_confirm_1180", "情報処方の確認", "14 情報処方");
  await s.getByRole("button", { name: "1件の情報処方を確定" }).click();
  await s.getByRole("heading", { name: "情報処方を届けました" }).waitFor();
  await shot(s, "14_sent_1180", "情報処方を届けました", "14 情報処方");
});
await step("15_end", async () => {
  await s.getByRole("button", { name: "診察を終えて共有終了" }).click();
  await s.locator("[data-share-ended]").waitFor();
  await s.waitForTimeout(1500);
  check("15 共有終了", "終了後に失敗の通知が出ない", (await s.locator("[data-toast-tone='error']").count()) === 0);
  await shot(s, "15_ended_1180", "共有を終了しました（医療者）", "15 共有終了");
  await it.goto(B + "/home");
  await it.locator(".d-share-chip").filter({ hasText: "共有する" }).waitFor({ timeout: 15_000 });
  await it.locator("[data-set-card]").waitFor();
  check("15 共有終了", "患者ホーム: 追加処方のあとも診断時セットが残る", (await it.locator("[data-set-card]").getAttribute("data-set-in-latest")) === "false");
  await shot(it, "15_home_after_390", "共有終了後の患者ホーム（新しい教材＋診断時セット）", "15 共有終了");
});
await it.context().close();
await b.close();

writeFileSync(`${OUT}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const scenes = [...new Set(shots.map((x) => x.scene))];
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>撮影リハーサル</title>
<style>body{font-family:system-ui,"Hiragino Sans",sans-serif;margin:16px;background:#f4f8f8;color:#243a3d}h1{font-size:20px}h2{margin-top:28px;font-size:16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}.card{background:#fff;border:1px solid #dce6e6;border-radius:12px;padding:10px}.card img{width:100%;border-radius:8px;border:1px solid #e6eeee}.card b{display:block;font-size:13px;margin:6px 0 2px}.card code{font-size:11px;color:#6f8082}table{border-collapse:collapse;font-size:13px;background:#fff}td,th{border:1px solid #dce6e6;padding:4px 8px;text-align:left}.ng{color:#a33}</style>
<h1>撮影リハーサル（隔離DB・基準日 2026-11-04・記録済みClaude出力の再生・Claude呼び出しなし）</h1>
<p>患者 390×844 / 430×932、医療者 1180×820。伊藤 涼子＝学習・お金・入力、佐藤 花子＝経過・共有・Claude要約（記録は変えない）。QR・6桁コードは塗りつぶし。</p>
<h2>確認項目（${checks.filter((c) => c.ok).length} / ${checks.length} 合格）</h2>
<table><tr><th>シーン</th><th>確認</th><th>結果</th><th>詳細</th></tr>${checks.map((c) => `<tr><td>${esc(c.scene)}</td><td>${esc(c.item)}</td><td class="${c.ok ? "" : "ng"}">${c.ok ? "OK" : "要確認"}</td><td>${esc(c.detail)}</td></tr>`).join("")}</table>
${Object.keys(errors).length ? `<h2>操作できなかった手順</h2><ul>${Object.entries(errors).map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`).join("")}</ul>` : ""}
${scenes.map((sc) => `<h2>${esc(sc)}</h2><div class="grid">${shots.filter((x) => x.scene === sc).map((x) => `<div class="card"><a href="shots/${x.id}.png"><img loading="lazy" src="shots/${x.id}.png" alt="${esc(x.label)}"></a><b>${esc(x.label)}</b><code>${x.id}</code></div>`).join("")}</div>`).join("")}
</html>`;
writeFileSync(`${OUT}/index.html`, html);
console.log(`shots ${shots.length} checks ${checks.filter((c) => c.ok).length}/${checks.length} errors ${Object.keys(errors).length}`);
for (const c of checks.filter((c) => !c.ok)) console.log("NG", c.scene, c.item, c.detail);
