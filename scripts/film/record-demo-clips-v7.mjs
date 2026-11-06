#!/usr/bin/env node
/**
 * v7: #10（Claude 外来間サマリー）・#12（要約の範囲の注意書き）・#14（教材スタジオ）を端末の実解像度で撮り直す。寄り（ズーム）は撮影後に zoom-demo-clips-v7.mjs で付ける。
 *   v6 との違い: DevTools の画面配信は deviceScaleFactor を指定しても CSS px（1180×820）のコマしか返さないため、
 *   --force-device-scale-factor=3 で起動し、実際に 3540×2460 のコマを受け取る（最初のコマの大きさを確認する）。操作と時刻は v6 と同じ。
 *   BASE   : 隔離サーバー（新しい一時 DB。sh scripts/review/serve.sh <port> <dbPort>）。3900 には接続しない
 *   FILM   : 出力先の親（既定 ~/Developer/shiori-demo-film）。FILM/v7/raw/ に区間ごとの MP4（端末の倍率 3 の原寸）と events.json
 *   FFMPEG : ffmpeg のパス
 * 寄りの画面でも文字が粗くならないよう、iPad（1180×820）を倍率 3 で撮る。画面内の操作は 1 倍速。文言・データ・Claude の出力は変えない。
 * Claude は呼ばない（外来間サマリー・教材スタジオは記録済みの出力の再生）。
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const B = process.env.BASE ?? "http://localhost:3470";
if (/:3900\b/.test(B)) throw new Error("3900 の撮影環境には接続しません");
const FILM = process.env.FILM ?? path.join(os.homedir(), "Developer/shiori-demo-film");
const OUT = path.join(FILM, "v7", "raw");
const FFMPEG = process.env.FFMPEG;
if (!FFMPEG || !existsSync(FFMPEG)) throw new Error("FFMPEG（ffmpeg のパス）を指定してください");
const TMP = path.join(os.tmpdir(), "shiori-film-frames-v7");
mkdirSync(OUT, { recursive: true });
const PHONE = { vp: { width: 393, height: 852 }, dpr: 3 }; // 起動の倍率（3）とそろえる
const IPAD = { vp: { width: 1180, height: 820 }, dpr: 3 };
const events = { device: IPAD, segments: {} };

const browser = await chromium.launch({ args: ["--lang=ja-JP", "--hide-scrollbars", `--force-device-scale-factor=${IPAD.dpr}`] });
const TAP = () => {
  addEventListener("pointerdown", (e) => {
    const d = document.createElement("div");
    d.style.cssText = `position:fixed;left:${e.clientX - 20}px;top:${e.clientY - 20}px;width:40px;height:40px;border-radius:50%;border:2px solid rgba(49,94,104,.75);background:rgba(49,94,104,.14);z-index:2147483647;pointer-events:none;transition:opacity .55s ease-out, transform .55s ease-out`;
    document.documentElement.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = "0"; d.style.transform = "scale(1.7)"; });
    setTimeout(() => d.remove(), 650);
  }, true);
};
async function session(kind, name, dev) {
  const ctx = await browser.newContext({ baseURL: B, viewport: dev.vp, deviceScaleFactor: dev.dpr, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "light" });
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
/** targetSel の要素が、スクロール領域の上から offset px の位置に来るように（瞬時） */
async function scrollTo(p, mainSel, targetSel, offset) {
  await p.locator(targetSel).first().evaluate((el, [mainSel, offset]) => {
    const m = document.querySelector(mainSel);
    m.scrollTop = m.scrollTop + el.getBoundingClientRect().top - m.getBoundingClientRect().top - offset;
  }, [mainSel, offset]);
}
/** 内側のスクロール領域をなめらかに動かす（v1 の #12 と同じ） */
async function smoothScroll(p, sel, to, ms) {
  await p.locator(sel).first().evaluate(async (el, [to, ms]) => {
    const from = el.scrollTop, target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, to)), t0 = performance.now();
    await new Promise((r) => { const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; el.scrollTop = from + (target - from) * e; if (k < 1) requestAnimationFrame(step); else r(); }; requestAnimationFrame(step); });
  }, [to, ms]);
}
const rectOf = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 10) / 10); });

/** 1 区間を録画。mark(name) で区間内の出来事の時刻（最初のコマからの秒）を残す */
async function record(p, name, fn) {
  const cdp = await p.context().newCDPSession(p);
  const frames = [];
  cdp.on("Page.screencastFrame", (e) => {
    frames.push({ data: e.data, t: Date.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
  });
  const { vp, dpr } = p.dev;
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: vp.width * dpr, maxHeight: vp.height * dpr, everyNthFrame: 1 });
  await p.evaluate(() => { const d = document.createElement("i"); d.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:.02;pointer-events:none"; document.body.appendChild(d); setTimeout(() => d.remove(), 80); });
  for (let i = 0; i < 60 && frames.length === 0; i++) await p.waitForTimeout(20);
  const marks = {};
  const mark = (k) => { marks[k] = Date.now() / 1000; };
  await fn(mark);
  const end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.detach().catch(() => {});
  const t0 = frames[0].t;
  // 実解像度のコマか（CSS px のコマを拡大していないか）
  const jpg = Buffer.from(frames[0].data, "base64");
  let i = 2, size = null;
  while (i < jpg.length) { const m = jpg[i + 1], l = jpg.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc2) { size = [jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)]; break; } i += 2 + l; }
  if (!size || size[0] !== vp.width * dpr) throw new Error(`${name}: コマの幅が ${size?.[0]}（期待 ${vp.width * dpr}）`);
  const dir = path.join(TMP, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const lines = [];
  frames.forEach((f, i) => {
    const file = `f${String(i).padStart(5, "0")}.jpg`;
    writeFileSync(path.join(dir, file), Buffer.from(f.data, "base64"));
    lines.push(`file '${file}'`, `duration ${Math.max(1 / 60, (i + 1 < frames.length ? frames[i + 1].t : end) - f.t).toFixed(4)}`);
  });
  lines.push(lines[lines.length - 2]);
  writeFileSync(path.join(dir, "list.txt"), lines.join("\n") + "\n");
  const W = vp.width * dpr, H = vp.height * dpr;
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
    "-vf", `scale=${W}:${H}:flags=lanczos,fps=30,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-r", "30", "-an", path.join(OUT, `${name}.mp4`)]);
  rmSync(dir, { recursive: true, force: true });
  const seg = { seconds: +(end - t0).toFixed(3), frames: frames.length, frameSize: size, marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, +(v - t0).toFixed(3)])) };
  console.log(name, JSON.stringify(seg));
  return seg;
}

// ================= 佐藤 花子（スマートフォン）＋ 医療者（iPad 1180×820・倍率 3） =================
const hanako = await session("patient", "佐藤 花子", PHONE);
const staff = await session("staff", "佐藤 一郎", IPAD);
const C = ".cd-main";
{
  const live = await (await staff.request.get("/api/v1/staff/live")).json();
  if (live.activeSessionId) throw new Error("共有が残っています。新しい一時 DB で撮ってください");
}
await staff.goto("/staff");
await hanako.goto("/home?view=share");
await hanako.locator("[data-share-issue]").click();
await hanako.locator("[data-share-code]").waitFor();
const code = ((await hanako.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
await staff.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力/ }).click();
await staff.locator(".cd-code-panel input").fill(code);
await staff.getByRole("button", { name: "患者へ承認を依頼する" }).click();
await hanako.locator("[data-share-request]").waitFor({ timeout: 15_000 });
await hanako.locator(".d-consent input").check();
await hanako.getByRole("button", { name: "この医療者に共有を許可する" }).click();
await staff.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
const sid = (await (await staff.request.get("/api/v1/staff/live")).json()).activeSessionId;
const replayCheck = async () => {
  const r = await (await staff.request.post(`/api/v1/consultations/${sid}/intervisit/summary`, { data: {} })).json();
  const d = r.data ?? r;
  return { status: d.status, replay: !!d.replayOf, items: d.items?.length, rejected: d.rejected?.length ?? 0 };
};

// #10 Claude 外来間サマリー: v5 と同じ位置（外来間の経過の見出しから）。画面は静止、寄りは撮影後に付ける
await staff.locator("[data-intervisit]").getByText("記録済みのClaude出力を再生", { exact: false }).first().waitFor({ timeout: 30_000 });
await settle(staff, 600);
await scrollTo(staff, C, "[data-intervisit]", 20);
await settle(staff, 500);
{
  const row = staff.locator('[data-key-row="questions"] [data-summary-key-item]').filter({ hasText: "手のしびれは、治療が終わったら戻りますか？" }).first();
  const quote = await row.locator("span").evaluate((s) => {
    const tn = s.firstChild, i = tn.textContent.indexOf("「手のしびれ"), r = document.createRange();
    r.setStart(tn, i); r.setEnd(tn, tn.textContent.length);
    const b = r.getBoundingClientRect();
    return [b.left, b.top, b.right, b.bottom].map((v) => Math.round(v * 10) / 10);
  });
  events.summary = { quote, evidence: await rectOf(row.locator("small")), row: await rectOf(row), label: await rectOf(staff.locator('[data-key-row="questions"] > b')) };
  events.segments.summary = await record(staff, "summary", async () => { await hold(staff, 9200); });
}
events.replayAfterSummary = await replayCheck();

// #12 AI は診断しない: v1 と同じ操作（外来間の経過の見出しから、1.3 秒後に要約の範囲の注意書きまで 1.3 秒でスクロール）
await scrollTo(staff, C, "[data-intervisit]", 20);
await settle(staff, 400);
{
  const y = await staff.locator(".cd-summary-safety").first().evaluate((el, mainSel) => {
    const m = document.querySelector(mainSel);
    return m.scrollTop + el.getBoundingClientRect().top - m.getBoundingClientRect().top - 330;
  }, C);
  events.segments.scope = await record(staff, "scope", async () => {
    await hold(staff, 1300);
    await smoothScroll(staff, C, y, 1300);
    await hold(staff, 4800);
  });
  events.scope = { safety: await rectOf(staff.locator(".cd-summary-safety").first()) };
}

// #14 教材スタジオ: 施設の資料 →（カット）Claude の教材ドラフト（記録済み出力の再生の表示）→（カット）承認・公開 →（カット）教材ライブラリで処方に追加
await staff.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click();
await staff.locator("[data-source-file]").waitFor({ state: "attached" });
// 作成元・許諾の根拠は画面の外で入力（入力の早送りは見せない。v3 と同じ）
await staff.locator(".cd-form-grid input").nth(1).fill("さくら総合病院 薬剤部（架空）");
await staff.locator(".cd-form-grid textarea").fill("院内作成の架空資料。患者向け教材化と AI 処理を許可（デモ）");
await settle(staff, 500);
const STUDIO_TITLE = JSON.parse(readFileSync("docs/design/phase2/step5/replay/studio_replay.json", "utf8")).material.title;
// 1. 施設の資料（v3 と同じ操作。最後の間だけ 0.15 秒短く）
events.segments.studio1 = await record(staff, "studio1", async (mark) => {
  await hold(staff, 1200);
  await staff.locator("[data-source-file]").setInputFiles("tests/fixtures/sources/hormone_therapy_detailed_demo.docx");
  mark("file");
  await hold(staff, 1500);
  await staff.locator(".cd-license-check input").nth(0).check();
  mark("check1");
  await hold(staff, 1100);
  await staff.locator(".cd-license-check input").nth(1).check();
  mark("check2");
  await hold(staff, 1400);
});
// （カット）作成方針 → Claude に構成案を依頼（記録済みの出力を再生）→ 案 1 → 必ず含める内容を原文と照合 → 下書き
await staff.getByRole("button", { name: "次へ進む" }).click();
await staff.getByRole("heading", { name: "教材の作成方針" }).waitFor({ timeout: 30_000 });
await staff.getByRole("button", { name: "Claudeに構成案を依頼" }).click();
await staff.getByRole("heading", { name: "Claudeの構成案を比較" }).waitFor({ timeout: 60_000 });
await staff.getByRole("button", { name: "次へ進む" }).click();
for (const c of await staff.locator("[data-must-item] input[type=checkbox]").all()) await c.check();
await staff.getByRole("button", { name: "確認した内容で下書きを作成" }).click();
await staff.locator("[data-studio-editor]").waitFor({ timeout: 60_000 });
await staff.locator(C).first().evaluate((m) => (m.scrollTop = 0));
await settle(staff, 500);
// 2. Claude の教材ドラフト（画面上部に「記録済みのClaude出力…を再生しています。今回はClaudeを呼び出していません。」）
{
  const banner = staff.locator(C).getByText("記録済みのClaude出力", { exact: false }).first();
  events.studio2 = { banner: await rectOf(banner), bannerText: (await banner.textContent())?.trim() };
  events.segments.studio2 = await record(staff, "studio2", async () => { await hold(staff, 3000); });
}
// （カット）患者向けプレビュー → 承認依頼 → 確認項目（画面の外。v3 と同じ）
await staff.getByRole("button", { name: "次へ進む" }).click();
await staff.locator(".cd-preview-actions").getByRole("button", { name: "承認依頼へ" }).click();
await staff.getByRole("heading", { name: "医学的承認と公開" }).waitFor();
for (const c of await staff.locator(".cd-approval-check input").all()) await c.check();
await settle(staff, 400);
// 3. 確認項目がそろった承認の画面 →「医学的に承認して公開」→ 公開
events.segments.studio3 = await record(staff, "studio3", async (mark) => {
  await hold(staff, 350);
  await staff.getByRole("button", { name: "医学的に承認して公開" }).click();
  mark("approve");
  await staff.getByRole("heading", { name: "教材を公開しました" }).waitFor({ timeout: 15_000 });
  mark("published");
  await hold(staff, 600);
});
// （カット）教材ライブラリ（公開した教材のカード。v3 と同じ位置）
await staff.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
const card = staff.locator(".cd-library-grid article").filter({ hasText: STUDIO_TITLE }).first();
await card.waitFor();
await scrollTo(staff, C, `.cd-library-grid article:has-text("${STUDIO_TITLE}")`, 220);
await settle(staff, 400);
// 4. 同じカードの「処方に追加」→「選択済み」
events.studio4 = { card: await rectOf(card), button: await rectOf(card.getByRole("button", { name: /処方に追加/ })) };
events.segments.studio4 = await record(staff, "studio4", async (mark) => {
  await hold(staff, 1300);
  await card.getByRole("button", { name: /処方に追加/ }).click();
  mark("click");
  await card.getByRole("button", { name: /選択済み/ }).waitFor();
  mark("selected");
  await hold(staff, 2600);
});
events.studio4.buttonAfter = await rectOf(card.getByRole("button", { name: /選択済み/ }));
events.replayAfterStudio = await replayCheck();
// 共有を終える（選択中の教材は処方しない）
await staff.locator(".cd-app-header, [data-header-compact]").getByRole("button", { name: /共有終了/ }).first().click();
await staff.locator("[data-share-ended]").waitFor();
writeFileSync(path.join(OUT, "events.json"), JSON.stringify(events, null, 2));
await browser.close();
console.log("replay:", JSON.stringify(events.replayAfterSummary), JSON.stringify(events.replayAfterStudio));
