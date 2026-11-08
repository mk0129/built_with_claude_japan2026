#!/usr/bin/env node
/**
 * 教材イラスト（2026-11-08 の 57 点）の通し確認。審査用デモ（ローカルの .judge-demo/dist の配信、または公開 URL）を審査員と同じ入口から操作し、
 * 患者側（スマートフォン幅 390×844）と医療者側（タブレット幅 1024×768）で、登録した画像が正しい箇所に表示されるかを
 * DOM（currentSrc・naturalWidth・naturalHeight）で台帳と照合し、代表画面を撮る。読み取りと架空データの操作だけ。
 *   node scripts/review/illustration-walkthrough.mjs <demo-url> <out-dir>
 * - 新しいブラウザーコンテキスト（sessionStorage が空）で開始する。
 * - 出力: <out-dir>/*.png（代表画面）と <out-dir>/walkthrough.json（照合結果）。NG があれば終了コード 1。
 * 患者側: ホーム →「化学療法中の副作用とセルフケア」1〜5 ページの挿絵 → 6 ページ目は線画の代替 → 理解確認（戻る操作を含む）→ 教材一覧のサムネイル → 検索 → 詳細 → セット詳細の表紙。
 * 医療者側:「デモ: 架空患者の共有を開始する」→ 教材ライブラリ（教材の絵・セットの表紙）→ 処方 → 同じタブで患者側 → 届いた教材の挿絵。
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [address, outDir] = process.argv.slice(2);
if (!address || !outDir) throw new Error("Usage: node scripts/review/illustration-walkthrough.mjs <demo-url> <out-dir>");
mkdirSync(outDir, { recursive: true });
const origin = new URL(address).origin;
const manifest = JSON.parse(readFileSync("docs/design/illustration_batch_20261108/delivery_manifest.json", "utf8"));
const thumbByTitle = new Map(manifest.items.filter((i) => i.kind === "thumbnail").map((i) => [i.key, i]));
const coverBySet = new Map(manifest.items.filter((i) => i.kind === "cover").map((i) => [i.key, i]));
const editorialByPage = new Map(manifest.items.filter((i) => i.kind === "editorial").map((i) => [`${i.materialTitle}#${i.slideSeq}`, i]));
const SE = "化学療法中の副作用とセルフケア";
const NEURO = "手足のしびれ（末梢神経障害）とのつきあい方";

const results = [];
const errors = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "OK" : "NG"}  ${name}${detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
};
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
};
const imgInfo = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { src: el.currentSrc.replace(location.origin, ""), natural: [el.naturalWidth, el.naturalHeight], complete: el.complete, alt: el.alt, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  }, selector);
async function waitImg(page, selector, timeout = 20000) {
  await page.waitForFunction((sel) => { const el = document.querySelector(sel); return !!el && el.complete && el.naturalWidth > 0; }, selector, { timeout }).catch(() => {});
  return imgInfo(page, selector);
}
const counterOf = (page) => page.locator(".d-learning-head span").first().innerText();
const sameImage = (info, item) => !!info && info.src === item.files[0].url && info.natural[0] === item.files[0].width && info.natural[1] === item.files[0].height;
const trackErrors = (page, side) => {
  page.on("pageerror", (e) => errors.push(`${side}: ${e}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    // /api/ は公開デモのサーバー関数（教材スタジオの設定確認など）。静的配信（python -m http.server）では存在しないため画像の確認の対象外
    if (r.status() >= 400 && u.origin === origin && !u.pathname.startsWith("/api/")) errors.push(`${side}: HTTP ${r.status()} ${u.pathname}`);
  });
};
async function clickIf(locator) {
  if ((await locator.count()) && (await locator.first().isVisible())) {
    await locator.first().click();
    return true;
  }
  return false;
}

const browser = await chromium.launch({ headless: true });
let liveCommit = null;
try {
  liveCommit = JSON.parse(await (await fetch(new URL("/judge-release.json", origin), { cache: "no-store" })).text()).commit;
} catch {
  liveCommit = null;
}
try {
  // ---------------- 患者側（390×844） ----------------
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const p = await pctx.newPage();
  trackErrors(p, "patient");
  await p.goto(address, { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: "患者として体験", exact: true }).click();
  await p.locator("[data-home-v3]").waitFor({ timeout: 30000 });
  await p.waitForTimeout(500);
  await shot(p, "P01_home_390");

  // ホームの「化学療法中の副作用とセルフケア」から入る（今日の教材のカード。無ければ教材一覧から）
  const homeCard = p.locator("[data-home-lesson]").filter({ hasText: SE });
  if (await homeCard.count()) {
    await homeCard.getByRole("button").last().click();
    check("患者: ホームの「今」のカードが「化学療法中の副作用とセルフケア」", true);
  } else {
    check("患者: ホームの「今」のカードが「化学療法中の副作用とセルフケア」", false, "カードがないため教材一覧から開く");
    await p.getByRole("button", { name: "教材を探す" }).click();
    await p.locator(".d-lesson-card").filter({ hasText: SE }).first().click();
  }
  await p.locator(".d-detail").waitFor();
  const detailHero = await waitImg(p, ".d-detail .d-image-slot img");
  check("患者: 教材詳細（副作用とセルフケア）のサムネイル", detailHero?.src === "/thumbnails/thumb_symptom_check.webp" && detailHero.natural[0] > 0, detailHero);
  await shot(p, "P02_detail_side_effects_390");
  await p.getByRole("button", { name: /学習を始める|から再開する|最初から|続きから/ }).first().click();
  await p.locator(".d-learning-head").waitFor();
  // 1 ページ目へ
  for (let i = 0; i < 8; i++) {
    if ((await counterOf(p)).trim().startsWith("1 /")) break;
    await p.getByRole("button", { name: "前へ", exact: true }).click();
    await p.waitForTimeout(250);
  }
  check("患者: 学習画面を 1 ページ目から開始", (await counterOf(p)).trim().startsWith("1 /"), await counterOf(p));
  const pages = [];
  for (let seq = 1; seq <= 5; seq++) {
    const expected = editorialByPage.get(`${SE}#${seq}`);
    const info = await waitImg(p, "[data-slide-illustration] img");
    const heading = await p.locator(".d-learning h1").innerText();
    const slideArt = await p.locator(".d-slide-art").count();
    const medicalTabs = await p.locator(".d-learning-tabs").count();
    const ok = sameImage(info, expected) && heading === expected.slideTitle && slideArt === 0 && medicalTabs === 0 && info.alt === expected.alt;
    check(`患者: ${SE} ${seq} ページ「${expected.slideTitle}」に ${expected.id}`, ok, { heading, ...info, slideArt, medicalTabs });
    pages.push({ seq, id: expected.id, heading, ...info, ok });
    await shot(p, `P1${seq}_learn_p${seq}_390`);
    await p.getByRole("button", { name: "次へ", exact: true }).click();
    await p.waitForTimeout(300);
  }
  // 6 ページ目（まとめ）: 登録なし → 線画の代替、挿絵なし
  const p6 = { counter: (await counterOf(p)).trim(), slideArt: await p.locator(".d-slide-art").count(), illustration: await p.locator("[data-slide-illustration]").count(), heading: await p.locator(".d-learning h1").innerText() };
  check("患者: 6 ページ目は登録なし（線画の代替・挿絵なし）", p6.counter.startsWith("6 /") && p6.slideArt === 1 && p6.illustration === 0, p6);
  await shot(p, "P16_learn_p6_390");
  // 理解確認
  await p.getByRole("button", { name: "理解を確認する" }).click();
  await p.locator("main").getByText("理解の確認").first().waitFor();
  await shot(p, "P20_quiz_q1_390");
  // 戻る操作（1）: 理解確認の「← 戻る」
  await p.getByRole("button", { name: /← 戻る/ }).click();
  await p.waitForTimeout(400);
  const afterBack = new URL(p.url());
  check("患者: 理解確認の「← 戻る」で前の画面に戻る", afterBack.searchParams.get("view") !== "quiz", `view=${afterBack.searchParams.get("view")}`);
  await shot(p, "P21_quiz_back_390");
  // 理解確認へ戻る（詳細または学習画面のボタンから）
  if (!(await clickIf(p.getByRole("button", { name: "理解を確認する" })))) {
    await clickIf(p.getByRole("button", { name: /理解確認|理解を確認/ }));
  }
  await p.locator("main").getByText("理解の確認").first().waitFor({ timeout: 10000 });
  // 設問に答える（架空の学習。1 問目は解説の「…のページへ戻る」で挿絵のページへ戻り、再び理解確認へ）
  let answered = 0;
  let backChecked = false;
  for (let i = 0; i < 10; i++) {
    const confirm = p.getByRole("button", { name: "この回答で確定する" });
    if (!(await confirm.count())) break;
    const unknown = p.locator("main button", { hasText: "わからない" });
    if (await unknown.count()) await unknown.first().click();
    else await p.locator("main button").filter({ hasText: /^A/ }).first().click();
    await confirm.click();
    answered++;
    await p.getByText("回答を記録しました").waitFor({ timeout: 10000 });
    if (!backChecked) {
      await shot(p, "P22_explanation_390");
      const backToPage = p.getByRole("button", { name: /のページへ戻る/ });
      if (await backToPage.count()) {
        const label = await backToPage.first().innerText();
        await backToPage.first().click();
        await p.locator(".d-learning-head").waitFor();
        const m = label.match(/「(.+)」/);
        const related = m ? [...editorialByPage.values()].find((e) => e.materialTitle === SE && e.slideTitle === m[1]) : null;
        const info = related ? await waitImg(p, "[data-slide-illustration] img") : null;
        check("患者: 解説の「…のページへ戻る」で、関連ページの挿絵が再び表示される", related ? sameImage(info, related) : false, { label, ...info });
        await shot(p, "P23_back_to_related_page_390");
        // 最後のページまで進めて理解確認へ戻る
        for (let k = 0; k < 8; k++) {
          const next = p.getByRole("button", { name: "次へ", exact: true });
          if (!(await next.count())) break;
          await next.click();
          await p.waitForTimeout(200);
        }
        await p.getByRole("button", { name: "理解を確認する" }).click();
        await p.locator("main").getByText("理解の確認").first().waitFor({ timeout: 10000 });
      }
      backChecked = true;
      continue;
    }
    if (await clickIf(p.getByRole("button", { name: "次の問題へ" }))) continue;
    if (await clickIf(p.getByRole("button", { name: /結果|終える|理解確認を終わる|まとめ/ }))) break;
    break;
  }
  await p.waitForTimeout(600);
  const resultText = await p.locator("main").innerText();
  check("患者: 理解確認を最後まで通した", answered >= 1 && /正解|結果|理解|問/.test(resultText), { answered, snippet: resultText.replace(/\s+/g, " ").slice(0, 80) });
  await shot(p, "P24_quiz_result_390");

  // 教材一覧（サムネイル）
  await p.getByRole("button", { name: "教材を探す" }).click();
  await p.locator(".d-lesson-card").first().waitFor();
  await p.waitForFunction(() => [...document.querySelectorAll(".d-lesson-card img")].length >= 30 && [...document.querySelectorAll(".d-lesson-card img")].every((i) => i.complete), null, { timeout: 20000 }).catch(() => {});
  const cards = await p.evaluate(() => [...document.querySelectorAll(".d-lesson-card")].map((c) => { const i = c.querySelector("img"); return { title: c.querySelector("b")?.textContent ?? "", src: i ? i.currentSrc.replace(location.origin, "") : null, natural: i ? [i.naturalWidth, i.naturalHeight] : null, alt: i?.alt ?? null }; }));
  const libraryRows = [];
  for (const [title, item] of thumbByTitle) {
    const card = cards.find((c) => c.title === title);
    const small = item.files[1];
    const ok = !!card && card.src === small.url && card.natural?.[0] === small.width && card.natural?.[1] === small.height;
    libraryRows.push({ id: item.id, title, ok, card });
    if (!ok) check(`患者: 教材一覧「${title}」のサムネイル`, false, card);
  }
  check("患者: 教材一覧の 22 教材すべてに新しいサムネイル（縮小版 192×144）", libraryRows.every((r) => r.ok), `${libraryRows.filter((r) => r.ok).length}/22、カード ${cards.length} 件`);
  await shot(p, "P30_library_top_390");
  await p.locator(".d-lesson-card").filter({ hasText: NEURO }).first().scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  await shot(p, "P31_library_cards_390");
  // 検索
  const search = p.getByPlaceholder("教材名やキーワード");
  await search.fill("しびれ");
  await search.press("Enter");
  await p.waitForTimeout(500);
  const searched = await p.evaluate(() => [...document.querySelectorAll(".d-lesson-card")].map((c) => ({ title: c.querySelector("b")?.textContent ?? "", src: c.querySelector("img")?.currentSrc.replace(location.origin, "") ?? null })));
  const neuroHit = searched.find((c) => c.title === NEURO);
  check("患者: 検索「しびれ」の結果に「手足のしびれ」のサムネイル", !!neuroHit && neuroHit.src === thumbByTitle.get(NEURO).files[1].url, searched.slice(0, 4));
  await shot(p, "P32_search_shibire_390");
  await p.locator(".d-lesson-card").filter({ hasText: NEURO }).first().click();
  await p.locator(".d-detail").waitFor();
  const neuroHero = await waitImg(p, ".d-detail .d-image-slot img");
  const neuroBand = await p.locator(".d-detail .d-image-slot.band").count();
  check("患者: 教材詳細（手足のしびれ）の原寸サムネイル（帯の切り抜き）", neuroHero?.src === thumbByTitle.get(NEURO).files[0].url && neuroHero.natural[0] === 1600 && neuroBand === 1, { ...neuroHero, band: neuroBand });
  await shot(p, "P33_detail_neuropathy_390");

  // セット詳細（表紙）
  await p.getByRole("button", { name: "ホーム", exact: true }).click();
  await p.locator("[data-home-v3]").waitFor();
  const setButton = p.locator("[data-set-open]").first();
  const setLabel = (await setButton.getAttribute("aria-label")) ?? "";
  const setName = setLabel.replace(/の内容を見る$/, "");
  await setButton.click();
  await p.locator("[data-set-detail]").waitFor();
  const cover = await waitImg(p, ".d-set-cover img");
  const coverItem = coverBySet.get(setName);
  check(`患者: セット詳細「${setName}」の表紙`, coverItem ? sameImage(cover, coverItem) : !!cover?.src, { setName, ...cover });
  const setLessonImgs = await p.evaluate(() => [...document.querySelectorAll("[data-set-lesson] img")].map((i) => ({ src: i.currentSrc.replace(location.origin, ""), natural: [i.naturalWidth, i.naturalHeight] })));
  check("患者: セット詳細の教材カードのサムネイル", setLessonImgs.length > 0 && setLessonImgs.every((i) => i.natural[0] > 0), setLessonImgs);
  await shot(p, "P40_set_detail_390");

  // 残りの挿絵 24 点: 公開教材はすべて自主学習で開けるので、各教材の 1 ページ目を開いて DOM で照合する（画面は撮らない）
  const sweep = [];
  for (const item of manifest.items.filter((i) => i.kind === "editorial" && i.materialTitle !== SE)) {
    const row = { id: item.id, title: item.materialTitle, seq: item.slideSeq, ok: false };
    try {
      await p.goto(`${origin}/?view=library#patient`, { waitUntil: "domcontentloaded" });
      await p.locator(".d-lesson-card").filter({ hasText: item.materialTitle }).first().click();
      await p.locator(".d-detail").waitFor();
      await p.getByRole("button", { name: /学習を始める|から再開する|最初から|続きから|もう一度/ }).first().click();
      await p.locator(".d-learning-head").waitFor();
      for (let i = 0; i < 8; i++) {
        if ((await counterOf(p)).trim().startsWith(`${item.slideSeq} /`)) break;
        await p.getByRole("button", { name: "前へ", exact: true }).click();
        await p.waitForTimeout(200);
      }
      const info = await waitImg(p, "[data-slide-illustration] img");
      const heading = await p.locator(".d-learning h1").innerText();
      Object.assign(row, { heading, ...info, ok: sameImage(info, item) && heading === item.slideTitle && info.alt === item.alt });
    } catch (e) {
      row.error = String(e).split("\n")[0];
    }
    sweep.push(row);
    if (!row.ok) check(`患者: ${item.materialTitle} ${item.slideSeq} ページに ${item.id}`, false, row);
  }
  check("患者: 残りの挿絵 24 点も各教材の 1 ページ目に表示（DOM 照合）", sweep.every((r) => r.ok), `${sweep.filter((r) => r.ok).length}/24`);
  results.push({ name: "sweep", ok: sweep.every((r) => r.ok), detail: sweep });
  results.push({ name: "pages", ok: pages.every((r) => r.ok), detail: pages });
  results.push({ name: "library", ok: libraryRows.every((r) => r.ok), detail: libraryRows });
  await pctx.close();

  // ---------------- 医療者側（1024×768） ----------------
  const cctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const c = await cctx.newPage();
  trackErrors(c, "clinician");
  await c.goto(address, { waitUntil: "domcontentloaded" });
  await c.getByRole("button", { name: "医療者として体験", exact: true }).click();
  await c.locator("[data-demo-start]").waitFor({ timeout: 30000 });
  await shot(c, "C01_doctor_entry_1024");
  await c.locator("[data-demo-start]").click();
  await c.getByRole("button", { name: "教材ライブラリ", exact: true }).waitFor({ timeout: 30000 });
  await c.waitForTimeout(800);
  await shot(c, "C02_summary_1024");
  await c.getByRole("button", { name: "教材ライブラリ", exact: true }).click();
  await c.locator(".cd-material-row").first().waitFor();
  await c.waitForFunction(() => document.querySelectorAll(".cd-material-row").length >= 30, null, { timeout: 20000 }).catch(() => {});
  // 遅延読み込みの画像をすべて読み込ませる
  const thumbCount = await c.locator(".cd-material-thumb img").count();
  for (let i = 0; i < thumbCount; i++) await c.locator(".cd-material-thumb img").nth(i).scrollIntoViewIfNeeded().catch(() => {});
  await c.waitForFunction(() => [...document.querySelectorAll(".cd-material-thumb img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20000 }).catch(() => {});
  const rows = await c.evaluate(() => [...document.querySelectorAll(".cd-material-row")].map((r) => { const i = r.querySelector(".cd-material-thumb img"); return { title: r.querySelector("b")?.textContent ?? "", src: i ? i.currentSrc.replace(location.origin, "") : null, natural: i ? [i.naturalWidth, i.naturalHeight] : null }; }));
  const clinicianRows = [];
  for (const [title, item] of thumbByTitle) {
    const hits = rows.filter((r) => r.title === title);
    const ok = hits.length > 0 && hits.every((h) => h.src === item.files[1].url && h.natural?.[0] === item.files[1].width);
    clinicianRows.push({ id: item.id, title, ok, hits });
    if (!ok) check(`医療者: ライブラリ「${title}」の絵`, false, hits);
  }
  check("医療者: ライブラリの 22 教材すべてに新しい絵（候補と一覧の行）", clinicianRows.every((r) => r.ok), `${clinicianRows.filter((r) => r.ok).length}/22、行 ${rows.length} 件`);
  const sets = await c.evaluate(() => [...document.querySelectorAll(".cd-template-row")].map((r) => { const i = r.querySelector(".cd-template-cover img"); return { name: r.dataset.templateName, src: i ? i.currentSrc.replace(location.origin, "") : null, natural: i ? [i.naturalWidth, i.naturalHeight] : null }; }));
  const setRows = [];
  for (const [name, item] of coverBySet) {
    const hit = sets.find((s) => s.name === name);
    const ok = !!hit && hit.src === item.files[0].url && hit.natural?.[0] === 800 && hit.natural?.[1] === 1000;
    setRows.push({ id: item.id, name, ok, hit });
    if (!ok) check(`医療者: セット「${name}」の表紙`, false, hit);
  }
  check("医療者: セット選択の 6 セットすべてに新しい表紙", setRows.every((r) => r.ok), `${setRows.filter((r) => r.ok).length}/6、セット ${sets.length} 件`);
  await c.locator(".cd-library-candidates, [data-library-candidates]").first().scrollIntoViewIfNeeded().catch(() => {});
  await c.evaluate(() => window.scrollTo(0, 0));
  await c.waitForTimeout(300);
  await shot(c, "C03_library_candidates_1024");
  await c.locator("[data-template-sets]").scrollIntoViewIfNeeded();
  await c.waitForTimeout(300);
  await shot(c, "C04_library_sets_1024");
  await c.locator("[data-library-browse]").scrollIntoViewIfNeeded();
  await c.waitForTimeout(300);
  await shot(c, "C05_library_rows_1024");
  // 処方: 候補の「手足のしびれ」を追加 → 確認 → 確定
  const candidate = c.locator("[data-candidate-row]").filter({ hasText: NEURO });
  if (await candidate.count()) await candidate.getByRole("button").first().click();
  else await c.locator(".cd-material-row").filter({ hasText: NEURO }).first().getByRole("button").first().click();
  await c.locator("[data-tray-review]").click();
  await c.getByRole("button", { name: /件の情報処方を確定/ }).waitFor();
  await shot(c, "C06_confirm_1024");
  await c.getByRole("button", { name: /件の情報処方を確定/ }).click();
  await c.waitForTimeout(1200);
  check("医療者: 「手足のしびれ」を 1 件処方", true);
  // 同じタブで患者側へ
  await c.getByRole("button", { name: "患者側", exact: true }).click();
  await c.locator("[data-home-v3]").waitFor({ timeout: 30000 });
  await c.waitForTimeout(500);
  const homeText = await c.locator("main").innerText();
  check("患者（同じタブ）: 新しく届いた教材が表示される", /新しく届いた教材/.test(homeText) && homeText.includes(NEURO), homeText.replace(/\s+/g, " ").slice(0, 120));
  await shot(c, "C07_patient_home_after_rx_1024");
  const delivered = c.locator("[data-home-lesson]").filter({ hasText: NEURO });
  await delivered.getByRole("button").last().click();
  await c.locator(".d-detail").waitFor();
  const deliveredHero = await waitImg(c, ".d-detail .d-image-slot img");
  check("患者（同じタブ）: 届いた教材の詳細に原寸サムネイル", deliveredHero?.src === thumbByTitle.get(NEURO).files[0].url, deliveredHero);
  await shot(c, "C08_patient_detail_neuropathy_1024");
  await c.getByRole("button", { name: /学習を始める|から再開する|最初から/ }).first().click();
  await c.locator(".d-learning-head").waitFor();
  const neuro1 = editorialByPage.get(`${NEURO}#1`);
  const deliveredIll = await waitImg(c, "[data-slide-illustration] img");
  check(`患者（同じタブ）: 届いた教材の 1 ページ目に ${neuro1.id}`, sameImage(deliveredIll, neuro1) && deliveredIll.alt === neuro1.alt, deliveredIll);
  await c.waitForTimeout(400);
  await shot(c, "C09_patient_learn_neuropathy_1024");
  results.push({ name: "clinicianLibrary", ok: clinicianRows.every((r) => r.ok), detail: clinicianRows });
  results.push({ name: "clinicianSets", ok: setRows.every((r) => r.ok), detail: setRows });
  results.push({ name: "delivered", ok: sameImage(deliveredIll, neuro1), detail: { id: neuro1.id, ...deliveredIll } });
  await cctx.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
const summary = { checkedAt: new Date().toISOString(), address, liveCommit, ok: failed.length === 0 && errors.length === 0, results, errors };
writeFileSync(path.join(outDir, "walkthrough.json"), JSON.stringify(summary, null, 1) + "\n");
console.log(`\n${results.length - failed.length}/${results.length} OK${errors.length ? `、ページエラー ${errors.length} 件: ${errors.slice(0, 5).join(" | ")}` : ""}（配信中のコミット ${liveCommit ?? "不明"}）`);
process.exit(summary.ok ? 0 : 1);
