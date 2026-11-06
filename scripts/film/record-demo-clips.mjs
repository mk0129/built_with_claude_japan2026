#!/usr/bin/env node
/**
 * 3 分デモ動画（shiori-intro.html）に組み込む実画面のクリップを撮る（無音 MP4・H.264・30fps・端末の外枠なし）。
 *   BASE   : 隔離サーバー（新しい一時 DB。sh scripts/review/serve.sh <port> <dbPort>）。3900 には接続しない
 *   FILM   : 出力先（既定 ~/Developer/shiori-demo-film）。<file>.mp4・first_last_frames/・qa.json
 *   FFMPEG : ffmpeg のパス（ffmpeg-static など。プロジェクトの依存には入れない）
 *   ONLY   : 撮り直すクリップ（例 ONLY=demo-step1-cost.mp4,demo-step3-qr.mp4）。指定外のクリップも操作はする（データの状態をそろえるため）が、録画しない
 *   新しい DB で 1 回通すこと（伊藤 涼子の理解確認・体調記録・質問、医療者の処方・教材の公開が DB に残るため）
 * 架空患者: #1〜#7 と #2 の予備は伊藤 涼子、#8〜#14 は佐藤 花子（記録は変えない。共有・閲覧と、医療者の情報処方・教材スタジオだけ）。
 * Claude は呼ばない（外来間サマリー・教材スタジオは記録済みの出力の再生）。計算結果・AI の出力・診療の内容は動画のために書き換えない。
 * 録画: Chrome DevTools の画面配信（Page.startScreencast）を端末の倍率（スマートフォン 3・iPad 2）で受け取り、30fps の MP4 にする。
 * タップした位置に控えめな円を出す（録画のページだけに表示。操作・データには影響しない）。
 * 編集のカットは承認済みの 2 本だけ（#4: 「もう少し詳しく」→ 理解確認、#14: 原資料 → Claude の構成案 → 承認・公開 → 情報処方）。
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepIto } from "../demo/prep-filming.mjs";

const B = process.env.BASE ?? "http://localhost:3470";
if (/:3900\b/.test(B)) throw new Error("3900 の撮影環境には接続しません");
const FILM = process.env.FILM ?? path.join(os.homedir(), "Developer/shiori-demo-film");
const FFMPEG = process.env.FFMPEG;
if (!FFMPEG || !existsSync(FFMPEG)) throw new Error("FFMPEG（ffmpeg のパス）を指定してください");
const ONLY = new Set((process.env.ONLY ?? "").split(",").filter(Boolean));
const want = (file) => ONLY.size === 0 || ONLY.has(file);
const TMP = path.join(os.tmpdir(), "shiori-film-frames");
mkdirSync(path.join(FILM, "first_last_frames"), { recursive: true });
const PHONE = { name: "スマホ", vp: { width: 393, height: 852 }, dpr: 3 };
const IPAD = { name: "iPad", vp: { width: 1180, height: 820 }, dpr: 2 };
const QA_FILE = path.join(FILM, "qa.json");
const qa = existsSync(QA_FILE) ? JSON.parse(readFileSync(QA_FILE, "utf8")) : {};

const browser = await chromium.launch({ args: ["--lang=ja-JP", "--hide-scrollbars"] });
await prepIto(browser, B);

const TAP = () => {
  addEventListener(
    "pointerdown",
    (e) => {
      const d = document.createElement("div");
      d.style.cssText = `position:fixed;left:${e.clientX - 20}px;top:${e.clientY - 20}px;width:40px;height:40px;border-radius:50%;border:2px solid rgba(49,94,104,.75);background:rgba(49,94,104,.14);z-index:2147483647;pointer-events:none;transition:opacity .55s ease-out, transform .55s ease-out`;
      document.documentElement.appendChild(d);
      requestAnimationFrame(() => { d.style.opacity = "0"; d.style.transform = "scale(1.7)"; });
      setTimeout(() => d.remove(), 650);
    },
    true,
  );
};
async function session(kind, name, dev) {
  const ctx = await browser.newContext({ baseURL: B, viewport: dev.vp, deviceScaleFactor: dev.dpr, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "light", reducedMotion: "no-preference" });
  await ctx.addInitScript(TAP);
  const p = await ctx.newPage();
  await p.goto(kind === "patient" ? "/login" : "/staff/login");
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 });
  p.dev = dev;
  return p;
}
const settle = async (p, ms = 350) => {
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))));
  await p.waitForTimeout(ms);
};
const hold = (p, ms) => p.waitForTimeout(ms);
/** 内側のスクロール領域（患者の main.d-main・医療者の .cd-main）をなめらかに動かす */
async function smoothScroll(p, sel, to, ms = 600) {
  await p.locator(sel).first().evaluate(async (el, [to, ms]) => {
    const from = el.scrollTop, target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, to)), t0 = performance.now();
    if (ms <= 1) { el.scrollTop = target; return; }
    await new Promise((r) => { const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; el.scrollTop = from + (target - from) * e; if (k < 1) requestAnimationFrame(step); else r(); }; requestAnimationFrame(step); });
  }, [to, ms]);
}
/** targetSel の要素が、スクロール領域の上から offset px の位置に来るように動かす */
async function scrollTo(p, mainSel, targetSel, offset = 16, ms = 600) {
  const y = await p.locator(targetSel).first().evaluate((el, [mainSel, offset]) => {
    const m = document.querySelector(mainSel);
    return m.scrollTop + el.getBoundingClientRect().top - m.getBoundingClientRect().top - offset;
  }, [mainSel, offset]);
  await smoothScroll(p, mainSel, y, ms);
}

/** 1 区間を録画（フレームと到着時刻）。録画しないクリップは操作だけ */
async function record(p, on, fn) {
  if (!on) { await fn(); return null; }
  const cdp = await p.context().newCDPSession(p);
  const frames = [];
  cdp.on("Page.screencastFrame", (e) => {
    frames.push({ data: e.data, t: Date.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
  });
  const { vp, dpr } = p.dev;
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: vp.width * dpr, maxHeight: vp.height * dpr, everyNthFrame: 1 });
  // 静止した画面では配信が止まるため、目に見えない変化で最初のコマを出させる
  await p.evaluate(() => { const d = document.createElement("i"); d.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:.02;pointer-events:none"; document.body.appendChild(d); setTimeout(() => d.remove(), 80); });
  for (let i = 0; i < 60 && frames.length === 0; i++) await p.waitForTimeout(20);
  await fn();
  const end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.detach().catch(() => {});
  return { frames, end };
}

/** 区間（1 つ以上）を 1 本の MP4 に。カットは区間のつなぎ目だけ */
function encode(file, segments, dev, note) {
  const segs = segments.filter((s) => s && s.frames.length);
  if (!segs.length) throw new Error(`${file}: コマがありません`);
  const dir = path.join(TMP, file.replace(/\.mp4$/, ""));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const lines = [];
  let n = 0, total = 0;
  const cuts = [];
  for (const s of segs) {
    if (total > 0) cuts.push(+total.toFixed(2));
    s.frames.forEach((f, i) => {
      const name = `f${String(n++).padStart(5, "0")}.jpg`;
      writeFileSync(path.join(dir, name), Buffer.from(f.data, "base64"));
      const next = i + 1 < s.frames.length ? s.frames[i + 1].t : s.end;
      const d = Math.max(1 / 60, next - f.t);
      total += d;
      lines.push(`file '${name}'`, `duration ${d.toFixed(4)}`);
    });
  }
  lines.push(lines[lines.length - 2]);
  writeFileSync(path.join(dir, "list.txt"), lines.join("\n") + "\n");
  const out = path.join(FILM, file);
  const W = dev.vp.width * dev.dpr, H = dev.vp.height * dev.dpr;
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
    "-vf", `scale=${W}:${H}:flags=lanczos,fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-r", "30", "-movflags", "+faststart", "-an", out]);
  const base = path.join(FILM, "first_last_frames", file.replace(/\.mp4$/, ""));
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", out, "-frames:v", "1", `${base}_first.png`]);
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-sseof", "-0.12", "-i", out, "-update", "1", "-frames:v", "1", `${base}_last.png`]);
  qa[file] = { seconds: +total.toFixed(2), segments: segs.length, cutsAt: cuts, frames: n, device: dev.name, patient: note, recordedAt: new Date().toISOString() };
  writeFileSync(QA_FILE, JSON.stringify(qa, null, 2));
  rmSync(dir, { recursive: true, force: true });
  console.log(`${file}  ${total.toFixed(1)}s  ${segs.length} 区間  ${n} コマ`);
}
/**
 * 1 本のクリップ。steps は ["shot", fn]（録画）と ["gap", fn]（録画しない操作。区間のあいだのカット）の並び。
 */
async function clip(file, p, note, steps) {
  const on = want(file);
  const segs = [];
  for (const [kind, fn] of steps) {
    if (kind === "shot") segs.push(await record(p, on, fn));
    else await fn();
  }
  if (on) encode(file, segs, p.dev, note);
}

// ================= 伊藤 涼子（スマートフォン 393×852） =================
const M = "main.d-main";
const ito = await session("patient", "伊藤 涼子", PHONE);
const lib = await (await ito.request.get("/api/v1/library")).json();
const idOf = (t) => (lib.data ?? lib).items.find((i) => i.title === t).materialId;

// #1 処方された情報: ホームの診断時セット → セットの内容（3 教材）
await ito.goto("/home");
await ito.locator("[data-set-card]").waitFor();
await settle(ito, 600);
await clip("demo-step1-info.mp4", ito, "伊藤 涼子", [["shot", async () => {
  await hold(ito, 1300);
  await ito.locator("[data-set-open]").click();
  await ito.locator("[data-set-detail]").waitFor();
  await settle(ito, 100);
  await hold(ito, 1400);
  await scrollTo(ito, M, "[data-set-lesson]", 150, 900);
  await hold(ito, 2400);
}]]);

// #2 予備（本編に入れない）: 仕事とお金のこと（社会制度の教材は承認前で「準備中」）
await ito.goto("/home");
await ito.locator("[data-money-card]").waitFor();
await settle(ito, 300);
await scrollTo(ito, M, "[data-money-card]", 300, 1);
await settle(ito, 300);
await clip("backup-demo-step1-support-pending.mp4", ito, "伊藤 涼子（予備・本編に入れない）", [["shot", async () => {
  await hold(ito, 900);
  await ito.locator("[data-money-card]").click();
  await ito.locator("[data-money-theme]").waitFor();
  await settle(ito, 100);
  await hold(ito, 2800);
}]]);

// #3 医療費シミュレーション: 条件 → 架空の例 → 92,940円（決定論的な計算・架空の例）
await ito.goto("/home?view=simulator");
await ito.locator("[data-sim-demo]").waitFor();
await settle(ito, 500);
await clip("demo-step1-cost.mp4", ito, "伊藤 涼子", [["shot", async () => {
  await hold(ito, 900);
  await ito.locator("[data-sim-demo]").click();
  await ito.locator("[data-sim-amount]").waitFor();
  await hold(ito, 3400);
}]]);

// #4 詳しい解説を開く →（カット）→ 理解確認の問題。#5 はそのまま続けて「わからない」
await ito.goto(`/home?view=learn&lesson=${idOf("乳がんの診断と病期の考え方")}`);
await ito.locator(".d-learning-head").filter({ hasText: /1 \/ \d/ }).waitFor();
await settle(ito, 700);
await clip("demo-step1-quiz.mp4", ito, "伊藤 涼子", [
  ["shot", async () => {
    await hold(ito, 600);
    await ito.locator(".d-disclosure").first().click();
    await ito.locator(".d-detail-copy").waitFor();
    await scrollTo(ito, M, ".d-disclosure", 250, 550);
    await hold(ito, 800);
  }],
  ["gap", async () => {
    for (let i = 0; i < 8; i++) {
      const t = await ito.locator(".d-learning-actions .primary-button").textContent();
      if (t?.includes("理解を確認する")) break;
      await ito.getByRole("button", { name: "次へ" }).click();
      await ito.waitForTimeout(250);
    }
    await ito.getByRole("button", { name: "理解を確認する" }).click();
    await ito.locator(".d-answer-list").waitFor();
    await settle(ito, 500);
  }],
  ["shot", async () => { await hold(ito, 3000); }],
]);

// #5 「わからない」と答える → 記録された結果（理解確認の 1 問目）
await clip("demo-step1-unsure.mp4", ito, "伊藤 涼子", [["shot", async () => {
  await hold(ito, 800);
  await ito.locator(".d-answer-list button").filter({ hasText: "わからない" }).click();
  await hold(ito, 600);
  await ito.getByRole("button", { name: "この回答で確定する" }).click();
  await ito.getByRole("heading", { name: /「わからない」を\s*記録しました/ }).waitFor();
  await hold(ito, 2600);
}]]);

// #6 熱や気になる症状をさっと記録（体温・だるさ → 保存）。医療的な警告の演出はしない（アプリにもない）
await ito.goto("/home");
await ito.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
await ito.locator(".d-measured-at input").waitFor();
await settle(ito, 300);
await scrollTo(ito, M, ".d-vital-grid", 70, 1);
await settle(ito, 300);
await clip("demo-step2-log.mp4", ito, "伊藤 涼子", [["shot", async () => {
  await hold(ito, 500);
  const temp = ito.locator(".d-vital-grid input").first();
  await temp.click();
  await temp.pressSequentially("37.2", { delay: 70 });
  await hold(ito, 250);
  await ito.locator(".d-symptom-records > *").first().locator(".d-severity-scale button").nth(1).click();
  await hold(ito, 350);
  await scrollTo(ito, M, "button:has-text('この記録を保存')", 520, 450);
  await ito.getByRole("button", { name: /この記録を保存/ }).click();
  await ito.locator(".toast").filter({ hasText: /記録しました/ }).waitFor();
  await hold(ito, 1800);
}]]);

// #7 先生に聞きたいことを残す（ホームの「診察で聞きたいこと」→ 追加 → 一覧に表示）
await ito.goto("/home");
await ito.locator("[data-home-note-input]").waitFor();
await settle(ito, 300);
await scrollTo(ito, M, "[data-home-note-input]", 330, 1);
await settle(ito, 300);
await clip("demo-step2-question.mp4", ito, "伊藤 涼子", [["shot", async () => {
  await hold(ito, 700);
  const input = ito.locator("[data-home-note-input]");
  await input.click();
  await input.pressSequentially("だるさが続く日は、仕事を休んだほうがよいですか？", { delay: 45 });
  await hold(ito, 400);
  await ito.getByRole("button", { name: /追加/ }).first().click();
  await hold(ito, 2600);
}]]);
await ito.context().close();

// ================= 佐藤 花子（スマートフォン）＋ 医療者（iPad 1180×820） =================
const hanako = await session("patient", "佐藤 花子", PHONE);
const staff = await session("staff", "佐藤 一郎", IPAD);
const C = ".cd-main";
await staff.goto("/staff");
await staff.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力/ }).waitFor();
await hanako.goto("/home?view=share");
await hanako.locator("[data-share-issue]").click();
await hanako.locator("[data-share-code]").waitFor();
await settle(hanako, 500);
const code = ((await hanako.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
// 医療者が 6 桁コードで申請（実際の申請。QR をカメラで読み取ったときと同じ申請）→ 承認待ち
await staff.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力/ }).click();
await staff.locator(".cd-code-panel input").fill(code);
await staff.getByRole("button", { name: "患者へ承認を依頼する" }).click();
await staff.getByRole("heading", { name: "患者の承認を待っています" }).waitFor();
await settle(staff, 300);

// #8 患者: QR の画面 → 申請が届く → 確認して承認 → 共有中 ／ #9 医療者: 承認待ち → 診察サマリー（同時に撮る）
const on8 = want("demo-step3-qr.mp4"), on9 = want("demo-step3-receive.mp4");
let seg9Promise = null;
const seg8 = await record(hanako, on8, async () => {
  await hanako.locator("[data-share-request]").waitFor({ timeout: 15_000 });
  await hold(hanako, 900);
  await hanako.locator(".d-consent input").check();
  await hold(hanako, 450);
  // 医療者の画面は、承認の直前から撮る（承認待ち → 診察サマリー）
  seg9Promise = record(staff, on9, async () => {
    await hold(staff, 300);
    await staff.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
    await settle(staff, 100);
    await hold(staff, 2200);
  });
  await hold(hanako, 250);
  await hanako.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await hanako.getByRole("heading", { name: /と一時共有中です/ }).waitFor({ timeout: 15_000 });
  await hold(hanako, 1600);
});
const seg9 = await seg9Promise;
if (on8) encode("demo-step3-qr.mp4", [seg8], PHONE, "佐藤 花子");
if (on9) encode("demo-step3-receive.mp4", [seg9], IPAD, "佐藤 花子");

// #10 Claude 外来間サマリー（記録済みの出力の再生・18/18 検証済み）
await staff.locator("[data-intervisit]").getByText("記録済みのClaude出力を再生", { exact: false }).first().waitFor({ timeout: 30_000 });
await settle(staff, 600);
await scrollTo(staff, C, "[data-intervisit]", 20, 1);
await settle(staff, 300);
await clip("demo-step3-claude-summary.mp4", staff, "佐藤 花子", [["shot", async () => {
  await hold(staff, 3500);
  await scrollTo(staff, C, "[data-severity-legend]", 140, 1100);
  await hold(staff, 4500);
}]]);

// #11 要約から元の記録 → 在宅経過表（グラフ・表）
await clip("demo-step3-claude-source.mp4", staff, "佐藤 花子", [["shot", async () => {
  await hold(staff, 700);
  await staff.locator("[data-key-row] [data-summary-key-item]").filter({ hasText: "わからない" }).first().click();
  await staff.locator("[data-summary-sources]").waitFor();
  await scrollTo(staff, C, "[data-key-summary]", 60, 700);
  await hold(staff, 2200);
  await staff.locator(".cd-sidebar").getByRole("button", { name: "在宅経過" }).click();
  await staff.getByRole("heading", { name: "在宅経過表" }).waitFor();
  await settle(staff, 100);
  await hold(staff, 2600);
}]]);

// #12 AI は診断しない: 要約の範囲の注意書き（アプリにある文言。CSS で 13px に拡大）
await staff.locator(".cd-sidebar").getByRole("button", { name: "診察" }).click();
await staff.locator("[data-intervisit]").getByText("記録済みのClaude出力を再生", { exact: false }).first().waitFor({ timeout: 30_000 });
await settle(staff, 500);
await scrollTo(staff, C, "[data-intervisit]", 20, 1);
await settle(staff, 300);
await clip("demo-step3-claude-scope.mp4", staff, "佐藤 花子", [["shot", async () => {
  await hold(staff, 1300);
  await scrollTo(staff, C, ".cd-summary-safety", 330, 1300);
  await hold(staff, 4800);
}]]);

// #13 次の診察までに必要な情報を処方（教材ライブラリ → 追加 → 確認 → 確定）
await staff.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
await staff.locator(".cd-library-grid").waitFor();
await smoothScroll(staff, C, 0, 1);
await settle(staff, 600);
const RX = "化学療法中の副作用とセルフケア";
await clip("demo-step3-claude-prescribe.mp4", staff, "佐藤 花子", [["shot", async () => {
  await hold(staff, 1000);
  await staff.locator(".cd-library-grid article").filter({ hasText: RX }).first().getByRole("button", { name: /処方に追加/ }).click();
  await hold(staff, 900);
  await staff.getByRole("button", { name: /選択中 1件/ }).click();
  await staff.getByRole("heading", { name: "今回の情報処方を確認" }).waitFor();
  await settle(staff, 100);
  await hold(staff, 1800);
  await staff.getByRole("button", { name: "1件の情報処方を確定" }).click();
  await staff.getByRole("heading", { name: "情報処方を届けました" }).waitFor();
  await hold(staff, 2600);
}]]);
// 処方のあとも Claude 外来間サマリーの再生が 18/18 のままか
const sid = (await (await staff.request.get("/api/v1/staff/live")).json()).activeSessionId;
const replayCheck = async () => {
  const r = await (await staff.request.post(`/api/v1/consultations/${sid}/intervisit/summary`, { data: {} })).json();
  const d = r.data ?? r;
  return { status: d.status, replay: !!d.replayOf, items: d.items?.length, rejected: d.rejected?.length ?? 0 };
};
qa._replayAfterPrescribe = await replayCheck();

// #14 教材スタジオ（架空の院内資料 → 記録済みの Claude 構成案 →（カット）医療者の承認・公開 →（カット）情報処方へ）
await staff.locator("[data-header-compact], .cd-sidebar").getByRole("button", { name: "教材スタジオ" }).first().click();
await staff.locator("[data-source-file]").waitFor({ state: "attached" });
await settle(staff, 500);
const STUDIO_TITLE = JSON.parse(readFileSync("docs/design/phase2/step5/replay/studio_replay.json", "utf8")).material.title;
await clip("demo-step4-studio.mp4", staff, "佐藤 花子との共有中（教材は架空の院内資料から）", [
  // 1. 各施設の資料（〜5.6 秒）: 架空の院内資料を登録（作成元・許諾の根拠・2 つの確認）→ 次へ
  ["shot", async () => {
    await hold(staff, 1200);
    await staff.locator("[data-source-file]").setInputFiles("tests/fixtures/sources/hormone_therapy_detailed_demo.docx");
    await hold(staff, 1000);
    await staff.locator(".cd-form-grid input").nth(1).pressSequentially("さくら総合病院 薬剤部（架空）", { delay: 30 });
    await staff.locator(".cd-form-grid textarea").fill("院内作成の架空資料。患者向け教材化と AI 処理を許可（デモ）");
    await hold(staff, 400);
    await staff.locator(".cd-license-check input").nth(0).check();
    await hold(staff, 300);
    await staff.locator(".cd-license-check input").nth(1).check();
    await hold(staff, 700);
    await staff.getByRole("button", { name: "次へ進む" }).click();
    await staff.getByRole("heading", { name: "教材の作成方針" }).waitFor({ timeout: 30_000 });
    await hold(staff, 350);
  }],
  // 2. Claude が教材案（〜8 秒）: 作成方針 → Claude に構成案を依頼 → 記録済みの構成案（画面に「記録済みの出力を再生・今回は呼び出していない」）
  ["shot", async () => {
    await hold(staff, 300);
    await staff.getByRole("button", { name: "Claudeに構成案を依頼" }).click();
    await staff.getByRole("heading", { name: "Claudeの構成案を比較" }).waitFor({ timeout: 60_000 });
    await settle(staff, 50);
    await hold(staff, 800);
  }],
  // （録画しない）必ず含める内容を原文と照合して確認 → 下書き → 編集 → 患者向けプレビュー → 承認依頼
  ["gap", async () => {
    await staff.getByRole("button", { name: "次へ進む" }).click();
    for (const c of await staff.locator("[data-must-item] input[type=checkbox]").all()) await c.check();
    await staff.getByRole("button", { name: "確認した内容で下書きを作成" }).click();
    await staff.locator("[data-studio-editor]").waitFor({ timeout: 60_000 });
    await staff.getByRole("button", { name: "次へ進む" }).click();
    await staff.locator(".cd-preview-actions").getByRole("button", { name: "承認依頼へ" }).click();
    await staff.getByRole("heading", { name: "医学的承認と公開" }).waitFor();
    await settle(staff, 300);
  }],
  // 3. 医療者が確認・承認して公開（〜10.3 秒）
  ["shot", async () => {
    await hold(staff, 250);
    for (const c of await staff.locator(".cd-approval-check input").all()) { await c.check(); await hold(staff, 150); }
    await hold(staff, 150);
    await staff.getByRole("button", { name: "医学的に承認して公開" }).click();
    await staff.getByRole("heading", { name: "教材を公開しました" }).waitFor({ timeout: 15_000 });
    await hold(staff, 450);
  }],
  // （録画しない）教材ライブラリへ
  ["gap", async () => {
    await staff.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
    await staff.locator(".cd-library-grid article").filter({ hasText: STUDIO_TITLE }).first().waitFor();
    await scrollTo(staff, C, `.cd-library-grid article:has-text("${STUDIO_TITLE}")`, 200, 1);
    await settle(staff, 300);
  }],
  // 4. 情報処方へ（〜11.5 秒）: 公開した教材を処方に追加
  ["shot", async () => {
    await hold(staff, 250);
    await staff.locator(".cd-library-grid article").filter({ hasText: STUDIO_TITLE }).first().getByRole("button", { name: /処方に追加/ }).click();
    await hold(staff, 900);
  }],
]);
qa._replayAfterStudio = await replayCheck();
// 共有を終える（選択中の教材は処方しない）
await staff.locator(".cd-app-header, [data-header-compact]").getByRole("button", { name: /共有終了/ }).first().click();
await staff.locator("[data-share-ended]").waitFor();
writeFileSync(QA_FILE, JSON.stringify(qa, null, 2));
await browser.close();
console.log("replay after prescribe:", JSON.stringify(qa._replayAfterPrescribe), " after studio:", JSON.stringify(qa._replayAfterStudio));
