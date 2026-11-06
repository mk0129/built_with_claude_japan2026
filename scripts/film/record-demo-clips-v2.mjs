#!/usr/bin/env node
/**
 * デモ動画クリップ v2（#3・#6・#7・#14 の撮り直し）。操作は原則 1 倍速・高速な文字入力なし・不要な操作はカット（短いディゾルブ）。
 *   BASE / FFMPEG / FILM は record-demo-clips.mjs と同じ。出力は FILM/v2/（元の動画は上書きしない）
 * v1 が速く見えた原因: MP4 は実時間どおり（再生倍率 1.0）。Playwright の操作そのものが速かった（文字入力 1 文字 30〜45ms、
 *   入力の瞬時の流し込み、0.15〜0.3 秒間隔の連続タップ、長いスクロールを 0.45 秒）。v2 は操作を減らし、人の速さの間を取り、結果を長く見せる。
 * 文字は画面の外（カットのあいだ）で入力し、入力済みの状態を見せる（入力の早送りはしない）。
 * Claude は呼ばない（教材スタジオは記録済み出力の再生。画面にもそう表示される）。医学的承認は確認項目がそろった状態を見せ、瞬時に完了したようには見せない。
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
const OUT = path.join(FILM, "v2");
const FFMPEG = process.env.FFMPEG;
if (!FFMPEG || !existsSync(FFMPEG)) throw new Error("FFMPEG（ffmpeg のパス）を指定してください");
const XF = 0.3; // ディゾルブの長さ（秒）
const TMP = path.join(os.tmpdir(), "shiori-film-frames-v2");
mkdirSync(path.join(OUT, "first_last_frames"), { recursive: true });
const PHONE = { name: "スマホ", vp: { width: 393, height: 852 }, dpr: 3 };
const IPAD = { name: "iPad", vp: { width: 1180, height: 820 }, dpr: 2 };
const qa = {};

const browser = await chromium.launch({ args: ["--lang=ja-JP", "--hide-scrollbars"] });
await prepIto(browser, B);
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
async function scrollTo(p, mainSel, targetSel, offset) {
  await p.locator(targetSel).first().evaluate((el, [mainSel, offset]) => {
    const m = document.querySelector(mainSel);
    m.scrollTop = Math.max(0, m.scrollTop + el.getBoundingClientRect().top - m.getBoundingClientRect().top - offset);
  }, [mainSel, offset]);
}
/** 1 区間を録画（フレームの到着時刻。到着と描画の差は 0.01 秒程度） */
async function record(p, fn) {
  const cdp = await p.context().newCDPSession(p);
  const frames = [];
  cdp.on("Page.screencastFrame", (e) => {
    frames.push({ data: e.data, t: e.metadata?.timestamp ?? Date.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
  });
  const { vp, dpr } = p.dev;
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: vp.width * dpr, maxHeight: vp.height * dpr, everyNthFrame: 1 });
  await p.evaluate(() => { const d = document.createElement("i"); d.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:.02;pointer-events:none"; document.body.appendChild(d); setTimeout(() => d.remove(), 80); });
  for (let i = 0; i < 60 && frames.length === 0; i++) await p.waitForTimeout(20);
  await fn();
  const end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.detach().catch(() => {});
  return { frames, end };
}
/** 1 区間 → MP4（30fps・実時間） */
function encodeSegment(seg, dev, out) {
  const dir = out.replace(/\.mp4$/, "_frames");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const lines = [];
  let total = 0;
  seg.frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, "0")}.jpg`;
    writeFileSync(path.join(dir, name), Buffer.from(f.data, "base64"));
    const next = i + 1 < seg.frames.length ? seg.frames[i + 1].t : seg.end;
    const d = Math.max(1 / 60, next - f.t);
    total += d;
    lines.push(`file '${name}'`, `duration ${d.toFixed(4)}`);
  });
  lines.push(lines[lines.length - 2]);
  writeFileSync(path.join(dir, "list.txt"), lines.join("\n") + "\n");
  const W = dev.vp.width * dev.dpr, H = dev.vp.height * dev.dpr;
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
    "-vf", `scale=${W}:${H}:flags=lanczos,fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-r", "30", "-an", out]);
  rmSync(dir, { recursive: true, force: true });
  return total;
}
/** 区間をディゾルブ（XF 秒）でつないで 1 本に */
function compose(file, segs, dev, note) {
  const dir = path.join(TMP, file.replace(/\.mp4$/, ""));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const parts = segs.map((s, i) => ({ file: path.join(dir, `s${i}.mp4`), d: 0 }));
  parts.forEach((p, i) => (p.d = encodeSegment(segs[i], dev, p.file)));
  const out = path.join(OUT, file);
  const args = ["-y", "-loglevel", "error"];
  parts.forEach((p) => args.push("-i", p.file));
  const cuts = [];
  if (parts.length === 1) {
    args.push("-map", "0:v");
  } else {
    let chain = "", prev = "[0:v]", offset = 0;
    for (let i = 1; i < parts.length; i++) {
      offset += parts[i - 1].d - XF;
      cuts.push(+offset.toFixed(2));
      const label = i === parts.length - 1 ? "[v]" : `[x${i}]`;
      chain += `${prev}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${offset.toFixed(3)}${label};`;
      prev = label;
    }
    args.push("-filter_complex", chain.replace(/;$/, ""), "-map", "[v]");
  }
  args.push("-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", "-an", out);
  execFileSync(FFMPEG, args);
  const total = parts.reduce((a, p) => a + p.d, 0) - XF * (parts.length - 1);
  const base = path.join(OUT, "first_last_frames", file.replace(/\.mp4$/, ""));
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", out, "-frames:v", "1", `${base}_first.png`]);
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-sseof", "-0.12", "-i", out, "-update", "1", "-frames:v", "1", `${base}_last.png`]);
  qa[file] = { seconds: +total.toFixed(2), segments: parts.length, dissolvesAt: cuts, dissolve: parts.length > 1 ? XF : 0, device: dev.name, patient: note };
  rmSync(dir, { recursive: true, force: true });
  console.log(`${file}  ${total.toFixed(2)}s  ${parts.length} 区間  ディゾルブ ${cuts.join(", ") || "なし"}`);
}

const M = "main.d-main";
const ito = await session("patient", "伊藤 涼子", PHONE);

// #3 医療費シミュレーター: 条件（手順 1〜5・総医療費 1,000,000 円）を表示した状態から →「計算する」→ 92,940円
await ito.goto("/home?view=simulator");
await ito.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
await ito.locator("[data-sim-choice='under70']").click();
await ito.locator("[data-sim-choice='employee']").click();
await ito.locator("[data-sim-choice='bracket-c']").click();
await ito.getByRole("button", { name: "100万円", exact: true }).click();
await scrollTo(ito, M, "[data-sim-step='5'], [data-sim-cost-input]", 170);
await settle(ito, 500);
{
  const s1 = await record(ito, async () => {
    await hold(ito, 1100);
    await ito.locator("[data-sim-calc]").click();
    await ito.locator("[data-sim-amount]").waitFor();
    await settle(ito, 50);
    await hold(ito, 2600);
  });
  compose("demo-step1-cost.mp4", [s1], PHONE, "伊藤 涼子");
}

// #6 体調記録: 体温は入力済み（架空の値）。自覚症状を選ぶ → 保存 → 保存の結果
await ito.goto("/home");
await ito.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
await ito.locator(".d-measured-at input").waitFor();
await ito.locator(".d-vital-grid input").first().fill("37.2");
await scrollTo(ito, M, ".d-symptom-records > *:nth-child(3)", 40);
await settle(ito, 500);
{
  const s1 = await record(ito, async () => {
    await hold(ito, 600);
    await ito.locator(".d-symptom-records > *").nth(2).locator(".d-severity-scale button").nth(1).click(); // 手足のしびれ 1（軽い）
    await hold(ito, 800);
    await ito.getByRole("button", { name: /この記録を保存/ }).click();
    await ito.locator(".toast").filter({ hasText: /記録しました/ }).waitFor();
    await hold(ito, 2000);
  });
  compose("demo-step2-log.mp4", [s1], PHONE, "伊藤 涼子");
}

// #7 質問メモ: 入力欄 →（カット）入力済みの文章 →「追加」→ 一覧に追加
await ito.goto("/home");
await ito.locator("[data-home-note-input]").waitFor();
await scrollTo(ito, M, "[data-home-note-input]", 330);
await settle(ito, 500);
{
  const input = ito.locator("[data-home-note-input]");
  const s1 = await record(ito, async () => {
    await hold(ito, 900);
    await input.click();
    await hold(ito, 800);
  });
  await input.fill("だるさが続く日は、仕事を休んだほうがよいですか？"); // 入力の様子は見せない（カット）
  await settle(ito, 300);
  const s2 = await record(ito, async () => {
    await hold(ito, 1000);
    await ito.getByRole("button", { name: /追加/ }).first().click();
    await hold(ito, 2400);
  });
  compose("demo-step2-question.mp4", [s1, s2], PHONE, "伊藤 涼子");
}
await ito.context().close();

// #14 教材スタジオ（佐藤 花子との共有中。スタジオは共有中だけ開ける）
const hanako = await session("patient", "佐藤 花子", PHONE);
const staff = await session("staff", "佐藤 一郎", IPAD);
const C = ".cd-main";
// 前の実行で共有が残っていたら終える（隔離 DB の共有だけ）
{
  const live = await (await staff.request.get("/api/v1/staff/live")).json();
  if (live.activeSessionId) await staff.request.post(`/api/v1/consultations/${live.activeSessionId}/end`, { data: {} });
}
await hanako.goto("/home?view=share");
await hanako.locator("[data-share-issue]").click();
const code = ((await hanako.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
await staff.goto("/staff");
await staff.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力/ }).click();
await staff.locator(".cd-code-panel input").fill(code);
await staff.getByRole("button", { name: "患者へ承認を依頼する" }).click();
await hanako.locator("[data-share-request]").waitFor({ timeout: 15_000 });
await hanako.locator(".d-consent input").check();
await hanako.getByRole("button", { name: "この医療者に共有を許可する" }).click();
await staff.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
await staff.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click();
await staff.locator("[data-source-file]").waitFor({ state: "attached" });
// 作成元・許諾の根拠は画面の外で入力（入力の早送りは見せない）
await staff.locator(".cd-form-grid input").nth(1).fill("さくら総合病院 薬剤部（架空）");
await staff.locator(".cd-form-grid textarea").fill("院内作成の架空資料。患者向け教材化と AI 処理を許可（デモ）");
await settle(staff, 500);
const STUDIO_TITLE = JSON.parse(readFileSync("docs/design/phase2/step5/replay/studio_replay.json", "utf8")).material.title;
{
  // 1. 0〜3 秒: 施設の資料を登録（架空の院内資料を選ぶ → 利用許諾と個人情報の確認）
  const s1 = await record(staff, async () => {
    await hold(staff, 700);
    await staff.locator("[data-source-file]").setInputFiles("tests/fixtures/sources/hormone_therapy_detailed_demo.docx");
    await hold(staff, 1000);
    await staff.locator(".cd-license-check input").nth(0).check();
    await hold(staff, 700);
    await staff.locator(".cd-license-check input").nth(1).check();
    await hold(staff, 900);
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
  await staff.locator(C).first().evaluate((m) => (m.scrollTop = 0)); // 再生の表示（記録済みの Claude 出力）が見える位置
  await settle(staff, 500);
  // 2. 3〜7 秒: Claude の教材ドラフト（記録済み出力の再生）→ 確認問題
  const s2 = await record(staff, async () => {
    await hold(staff, 1700);
    await staff.locator(".cd-main").getByText("理解確認", { exact: true }).first().click();
    await hold(staff, 2200);
  });
  // （カット）患者向けプレビュー → 承認依頼 → 医療者が確認項目を確かめる（画面の外。瞬時に終わったようには見せない）
  await staff.getByRole("button", { name: "次へ進む" }).click();
  await staff.locator(".cd-preview-actions").getByRole("button", { name: "承認依頼へ" }).click();
  await staff.getByRole("heading", { name: "医学的承認と公開" }).waitFor();
  for (const c of await staff.locator(".cd-approval-check input").all()) await c.check();
  await settle(staff, 400);
  // 3. 7〜11 秒: 医療者の確認がそろった承認の画面 →「医学的に承認して公開」→ 公開 →（カット）情報処方に追加
  const s3 = await record(staff, async () => {
    await hold(staff, 1100);
    await staff.getByRole("button", { name: "医学的に承認して公開" }).click();
    await staff.getByRole("heading", { name: "教材を公開しました" }).waitFor({ timeout: 15_000 });
    await hold(staff, 1000);
  });
  await staff.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  await staff.locator(".cd-library-grid article").filter({ hasText: STUDIO_TITLE }).first().waitFor();
  await scrollTo(staff, C, `.cd-library-grid article:has-text("${STUDIO_TITLE}")`, 220);
  await settle(staff, 400);
  const s4 = await record(staff, async () => {
    await hold(staff, 500);
    await staff.locator(".cd-library-grid article").filter({ hasText: STUDIO_TITLE }).first().getByRole("button", { name: /処方に追加/ }).click();
    await hold(staff, 1300);
  });
  compose("demo-step4-studio.mp4", [s1, s2, s3, s4], IPAD, "佐藤 花子との共有中（架空の院内資料）");
}
// 外来間サマリーの再生が保たれているか（教材の公開のあと）
const sid = (await (await staff.request.get("/api/v1/staff/live")).json()).activeSessionId;
const r = await (await staff.request.post(`/api/v1/consultations/${sid}/intervisit/summary`, { data: {} })).json();
const d = r.data ?? r;
qa._replayAfterStudio = { status: d.status, replay: !!d.replayOf, items: d.items?.length, rejected: d.rejected?.length ?? 0 };
await staff.locator(".cd-app-header, [data-header-compact]").getByRole("button", { name: /共有終了/ }).first().click();
await staff.locator("[data-share-ended]").waitFor();
writeFileSync(path.join(OUT, "qa.json"), JSON.stringify(qa, null, 2));
await browser.close();
console.log("replay:", JSON.stringify(qa._replayAfterStudio));
