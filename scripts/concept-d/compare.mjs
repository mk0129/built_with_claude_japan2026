#!/usr/bin/env node
/**
 * Figma Make（Concept D）と移植後の shiori（/d/*）を、同じビューポート・同じ操作手順で撮影し、画素差分を出す。
 *   FIGMA_URL   : Figma Make エクスポートを Vite で起動した URL（既定 http://127.0.0.1:5181/）
 *   SHIORI_URL  : shiori（既定 http://localhost:3400）
 *   OUT         : 出力先（既定 docs/design/concept_d/compare）
 *   ONLY        : 画面 ID の部分一致で絞り込み（例 ONLY=P0）
 * 比較対象は Figma のプロトタイプ外枠ではなく端末内の実アプリ（患者 .d-device / 医療者 .cd-device）。
 * Figma 側は 700px 以下で端末枠が外れる（角丸・影なし）ため、患者はその表示幅で撮る。医療者は 1180/820 の端末をそのまま撮る。
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIGMA = process.env.FIGMA_URL ?? "http://127.0.0.1:5181/";
const SHIORI = process.env.SHIORI_URL ?? "http://localhost:3400";
const OUT = process.env.OUT ?? "docs/design/concept_d/compare";
const ONLY = process.env.ONLY ?? "";
mkdirSync(join(OUT, "figma"), { recursive: true });
mkdirSync(join(OUT, "shiori"), { recursive: true });
mkdirSync(join(OUT, "diff"), { recursive: true });

const click = (text, opts = {}) => async (p, root) => {
  const loc = (opts.within ? root.locator(opts.within) : root).getByRole("button", { name: text, exact: !!opts.exact });
  await loc.nth(opts.nth ?? 0).click();
};
const clickSel = (sel, nth = 0) => async (p, root) => root.locator(sel).nth(nth).click();
const select = (label, value) => async (p) => p.getByLabel(label).selectOption(value);

/** 患者: 端末内の操作手順 */
const PATIENT = [
  ["P01_home", []],
  ["P02_prescriptions", [click(/今回の教材をすべて見る/)]],
  ["P03_library", [click("教材を探す", { within: ".d-nav" })]],
  ["P04_category", [click("教材を探す", { within: ".d-nav" }), clickSel(".d-category-cards button", 1)]],
  ["P05_detail", [click(/^教材を確認する/)]],
  ["P06_image_zoom", [click(/^教材を確認する/), clickSel(".d-main .d-image-placeholder")]],
  ["P07_learn", [click(/^教材を確認する/), click(/学習を始める|続きから|もう一度読む/)]],
  ["P08_learn_points", [click(/^教材を確認する/), click(/学習を始める|続きから|もう一度読む/), click("要点だけ読む")]],
  ["P09_quiz", [click(/^教材を確認する/), click(/学習を始める|続きから|もう一度読む/), click("理解を確認する")]],
  ["P10_quiz_selected", [click(/^教材を確認する/), click(/学習を始める|続きから|もう一度読む/), click("理解を確認する"), clickSel(".d-answer-list button", 0)]],
  ["P11_explanation", [click(/^教材を確認する/), click(/学習を始める|続きから|もう一度読む/), click("理解を確認する"), clickSel(".d-answer-list button", 0), click("この回答で確定する")]],
  ["P12_result", [click(/^教材を確認する/), click(/学習を始める|続きから|もう一度読む/), click("理解を確認する"), clickSel(".d-answer-list button", 0), click("この回答で確定する"), click("振り返りへ")]],
  ["P13_history", [click("学習記録", { within: ".d-nav" })]],
  ["P14_health_record", [click("体調記録", { within: ".d-nav" })]],
  ["P15_health_history", [click("体調記録", { within: ".d-nav" }), click("履歴・グラフ")]],
  ["P16_symptom_manage", [click("体調記録", { within: ".d-nav" }), click("症状を追加")]],
  ["P17_notes", [click("診察ノート", { within: ".d-nav" })]],
  ["P18_share", [clickSel(".d-share-chip")]],
];

/** 教材スタジオを n 工程目まで、画面の操作どおりに進める（原資料の登録・ライセンス確認・Must-cover の確認をしてから「次へ進む」） */
const studioTo = (n) => async (p, root) => {
  for (let i = 1; i < n; i++) {
    const next = root.locator(".cd-wizard-actions .cd-primary");
    if (await next.isDisabled()) {
      const up = root.locator(".cd-upload");
      if (await up.count()) await up.first().click();
      const boxes = root.locator(".cd-studio-body input[type=checkbox]:not(:checked)");
      while (await boxes.count()) await boxes.first().click();
    }
    await next.click();
    await p.waitForTimeout(150);
  }
};

/** 医療者: 端末内の操作手順 */
const toSummary = [click("患者との接続を開始"), click("患者へ承認を依頼する"), click("プロトタイプ：患者が承認")];
const CLINICIAN = [
  ["C01_gate", []],
  ["C02_request_qr", [click("患者との接続を開始")]],
  ["C03_request_code", [click("患者との接続を開始"), click("6桁コード")]],
  ["C04_waiting", [click("患者との接続を開始"), click("患者へ承認を依頼する")]],
  ["C05_summary", toSummary],
  ["C06_concern_detail", [...toSummary, clickSel(".cd-check-list article > button", 0), click("詳しく確認")]],
  ["C07_prescribe", [...toSummary, click("候補を確認する")]],
  ["C08_prescribe_review", [...toSummary, click("候補を確認する"), click(/選択中/)]],
  ["C09_prescribe_sent", [...toSummary, click("候補を確認する"), click(/選択中/), clickSel(".cd-review-layout .cd-primary, .cd-primary", 0)]],
  ["C10_course_table", [...toSummary, click("在宅経過", { within: ".cd-sidebar" })]],
  ["C11_course_vitals", [...toSummary, click("在宅経過", { within: ".cd-sidebar" }), click("バイタル統合")]],
  ["C12_course_symptom", [...toSummary, click("在宅経過", { within: ".cd-sidebar" }), click("症状グラフ")]],
  ["C13_library", [...toSummary, click("教材ライブラリ", { within: ".cd-sidebar" })]],
  ["C21_expired", []],
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => [`C${13 + n}_studio_step${n}`, [...toSummary, click("教材スタジオ", { within: ".cd-sidebar" }), studioTo(n)]]),
];

const HIDE_FRAME = ".prototype-bar,.concept-summary,.cd-testbar{display:none!important}.cd-device{border-radius:0!important}";
/** 期限切れなど、Figma でもテスト状態の切り替えでしか出ない画面。shiori 側は開発用 /d/dev の同じ切り替えを使う */
const TEST_STATES = { C21_expired: "expired" };

async function figmaPage(browser, vp, mode, clinicianVp, testState) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: "ja-JP" });
  const p = await ctx.newPage();
  await p.goto(FIGMA);
  if (mode === "clinician") {
    await p.locator(".view-switch").first().getByRole("button", { name: "医療者" }).click();
    await p.locator(".d-viewport-switch").getByRole("button", { name: `${clinicianVp}px` }).click();
    // プロトタイプの外枠だけを外す（端末が y=260.5 の半端な位置に置かれ文字の描画位置が 0.5px ずれるため。角丸も外枠の装飾）。端末内には触れない
    if (testState) await p.locator(".cd-testbar select").first().selectOption(testState);
    await p.addStyleTag({ content: HIDE_FRAME });
  }
  return { ctx, p, root: p.locator(mode === "patient" ? ".d-device" : ".cd-device") };
}

async function shioriPage(browser, vp, mode, cookies, testState, devVp) {
  const ctx = await browser.newContext({ viewport: testState ? devVp : vp, deviceScaleFactor: 1, locale: "ja-JP" });
  await ctx.addCookies(cookies);
  const p = await ctx.newPage();
  if (testState) {
    await p.goto(`${SHIORI}/d/dev`);
    await p.locator(".view-switch").first().getByRole("button", { name: "医療者" }).click();
    await p.locator(".d-viewport-switch").getByRole("button", { name: `${vp.width}px` }).click();
    await p.locator(".cd-testbar select").first().selectOption(testState);
    await p.addStyleTag({ content: HIDE_FRAME });
  } else await p.goto(`${SHIORI}/d/${mode}`);
  return { ctx, p, root: p.locator(mode === "patient" ? ".d-device" : ".cd-device") };
}

async function login(browser, kind, name) {
  const ctx = await browser.newContext({ locale: "ja-JP" });
  const p = await ctx.newPage();
  await p.goto(`${SHIORI}${kind === "patient" ? "/login" : "/staff/login"}`);
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL(kind === "patient" ? /\/home/ : /\/staff(\?.*)?$/);
  const cookies = await ctx.cookies();
  await ctx.close();
  return cookies;
}

async function settle(p) {
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
}

/** 端末内の縦スクロール領域を、上端・以降 1 画面ずつ（最大 6 枚）撮る */
async function capture(p, root, scrollSel, file) {
  const files = [];
  const sc = root.locator(scrollSel).first();
  const has = (await sc.count()) > 0;
  const max = has ? await sc.evaluate((el) => el.scrollHeight - el.clientHeight) : 0;
  const step = has ? await sc.evaluate((el) => Math.floor(el.clientHeight * 0.8)) : 0;
  const tops = [0];
  if (max > 0) for (let t = step; t < max + step && tops.length < 6; t += step) tops.push(Math.min(t, max));
  for (const [i, t] of [...new Set(tops)].entries()) {
    if (has) await sc.evaluate((el, y) => (el.scrollTop = y), t);
    await p.waitForTimeout(150);
    const f = `${file}${i ? `_s${i}` : ""}.png`;
    await root.screenshot({ path: f, animations: "disabled", caret: "hide" });
    files.push(f);
  }
  return files;
}

function diff(a, b, outFile) {
  const A = PNG.sync.read(readFileSync(a));
  const B = PNG.sync.read(readFileSync(b));
  const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
  const D = new PNG({ width: w, height: h });
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inA = x < A.width && y < A.height, inB = x < B.width && y < B.height;
      const ia = (y * A.width + x) * 4, ib = (y * B.width + x) * 4;
      let d = 255;
      if (inA && inB) d = Math.max(Math.abs(A.data[ia] - B.data[ib]), Math.abs(A.data[ia + 1] - B.data[ib + 1]), Math.abs(A.data[ia + 2] - B.data[ib + 2]));
      const g = inA ? Math.round((A.data[ia] + A.data[ia + 1] + A.data[ia + 2]) / 3) : 0;
      if (d > 24) {
        n++;
        D.data.set([255, 0, 80, 255], i);
      } else D.data.set([g, g, g, 60], i);
    }
  writeFileSync(outFile, PNG.sync.write(D));
  return { size: `${A.width}x${A.height} / ${B.width}x${B.height}`, sameSize: A.width === B.width && A.height === B.height, diffPx: n, ratio: +(n / (w * h)).toFixed(5) };
}

const browser = await chromium.launch();
const patientCookies = await login(browser, "patient", "佐藤 花子");
const staffCookies = await login(browser, "staff", "山田 太郎");
const results = [];

const runs = [
  ...["390", "430"].map((w) => ({ mode: "patient", vp: { width: +w, height: 844 }, tag: w, list: PATIENT, scroll: ".d-main" })),
  ...["1180", "820"].map((w) => ({ mode: "clinician", vp: { width: +w, height: 800 }, figmaVp: { width: Math.max(+w + 80, 1280), height: 1000 }, tag: w, list: CLINICIAN, scroll: ".cd-main, .cd-gate main" })),
];

for (const run of runs) {
  for (const [id, steps] of run.list) {
    const name = `${id}_${run.tag}`;
    if (ONLY && !name.includes(ONLY)) continue;
    const sides = {};
    for (const side of ["figma", "shiori"]) {
      const { ctx, p, root } =
        side === "figma"
          ? await figmaPage(browser, run.figmaVp ?? run.vp, run.mode, run.tag, TEST_STATES[id])
          : await shioriPage(browser, run.vp, run.mode, run.mode === "patient" ? patientCookies : staffCookies, TEST_STATES[id], run.figmaVp);
      try {
        await root.waitFor();
        await settle(p);
        for (const s of steps) {
          await s(p, root);
          await p.waitForTimeout(200);
        }
        await settle(p);
        sides[side] = await capture(p, root, run.scroll, join(OUT, side, name));
      } catch (e) {
        sides[side] = { error: String(e).split("\n")[0] };
      }
      await ctx.close();
    }
    if (Array.isArray(sides.figma) && Array.isArray(sides.shiori)) {
      const n = Math.max(sides.figma.length, sides.shiori.length);
      for (let i = 0; i < n; i++) {
        const fa = sides.figma[i], sb = sides.shiori[i];
        const key = `${name}${i ? `_s${i}` : ""}`;
        if (!fa || !sb) {
          results.push({ key, error: `scroll pages differ: figma ${sides.figma.length} / shiori ${sides.shiori.length}` });
          continue;
        }
        const r = diff(fa, sb, join(OUT, "diff", `${key}.png`));
        results.push({ key, ...r });
        // 左: Figma、中: shiori、右: 差分
        await sharp({ create: { width: 3 * (r.sameSize ? (await sharp(fa).metadata()).width : 1500) + 40, height: (await sharp(fa).metadata()).height, channels: 4, background: "#ffffff" } })
          .composite([
            { input: fa, left: 0, top: 0 },
            { input: sb, left: (await sharp(fa).metadata()).width + 20, top: 0 },
            { input: join(OUT, "diff", `${key}.png`), left: 2 * ((await sharp(fa).metadata()).width + 20), top: 0 },
          ])
          .png()
          .toFile(join(OUT, "diff", `${key}_side.png`))
          .catch(() => {});
      }
    } else results.push({ key: name, error: JSON.stringify(sides) });
    console.log(results.filter((r) => r.key.startsWith(name)).map((r) => `${r.key}: ${r.error ?? `${r.diffPx}px (${r.ratio}) ${r.size}`}`).join("\n"));
  }
}
await browser.close();
writeFileSync(join(OUT, `results${ONLY ? `_${ONLY}` : ""}.json`), JSON.stringify(results, null, 2));
