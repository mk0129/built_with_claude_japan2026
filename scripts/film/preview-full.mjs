#!/usr/bin/env node
/**
 * shiori-intro.html（撮影版のコピー）を 1920×1080 で P キー再生し、全編のプレビュー MP4 を作る（映像＋埋め込みのナレーション）。
 *   URL    : HTML を配信している URL（例 http://localhost:8765/shiori-intro.html。HTML と 14 本の MP4 を同じフォルダから配信）
 *   FILM   : 出力先（既定 ~/Developer/shiori-demo-film）。preview-full.mp4・narration.mp3・preview_qa.json
 *   FFMPEG : ffmpeg のパス
 * 音声: HTML に埋め込まれた MP3 を取り出し、再生が始まった時刻（audio の playing）に合わせて 1 本だけ重ねる（二重再生しない）。
 * 確認: 各動画の再生開始の時刻（ナレーションの時刻）、プレースホルダー（ファイル名の枠）が出た時間、動画の読み込み待ち。
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const URL = process.env.URL ?? "http://localhost:8765/shiori-intro.html";
const FILM = process.env.FILM ?? path.join(os.homedir(), "Developer/shiori-demo-film");
const FFMPEG = process.env.FFMPEG;
if (!FFMPEG) throw new Error("FFMPEG を指定してください");
const TMP = path.join(os.tmpdir(), "shiori-film-preview");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--lang=ja-JP"] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: "ja-JP" });
const p = await ctx.newPage();
await p.addInitScript(() => {
  window.__qa = { videos: [], waits: [], audioStart: null, ended: null };
  document.addEventListener("playing", (e) => {
    const t = e.target;
    if (t.tagName === "AUDIO") { if (window.__qa.audioStart == null) window.__qa.audioStart = Date.now() / 1000; }
    else if (t.tagName === "VIDEO") window.__qa.videos.push({ file: (t.currentSrc || t.src).split("/").pop(), wall: Date.now() / 1000 });
  }, true);
  document.addEventListener("waiting", (e) => { if (e.target.tagName === "VIDEO") window.__qa.waits.push({ file: (e.target.currentSrc || "").split("/").pop(), wall: Date.now() / 1000 }); }, true);
  document.addEventListener("ended", (e) => { if (e.target.tagName === "AUDIO") window.__qa.ended = Date.now() / 1000; }, true);
});
await p.goto(URL, { waitUntil: "networkidle" });
await p.waitForFunction(() => document.querySelector("#root")?.children.length > 0);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1500);
// 埋め込みのナレーション（MP3）を取り出す
const b64 = await p.evaluate(() => document.getElementById("narration").dataset.src.split(",")[1]);
const mp3 = path.join(FILM, "narration.mp3");
writeFileSync(mp3, Buffer.from(b64, "base64"));

// 画面配信（フレームはすぐディスクへ）
const cdp = await ctx.newCDPSession(p);
const list = [];
let n = 0;
cdp.on("Page.screencastFrame", (e) => {
  const name = `f${String(n++).padStart(6, "0")}.jpg`;
  writeFileSync(path.join(TMP, name), Buffer.from(e.data, "base64"));
  // 描画された時刻（配信の到着ではなく、フレームのタイムスタンプ）
  list.push({ name, t: e.metadata?.timestamp ?? Date.now() / 1000 });
  cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await p.waitForTimeout(800);
await p.keyboard.press("h"); // 再生中の UI（ヒント・操作ボタン）を隠す
await p.waitForTimeout(300);
await p.keyboard.press("p");
// プレースホルダー（「デモ動画」＋ファイル名の枠）が画面に出ている時間を 0.25 秒ごとに記録
const placeholders = [];
const titles = [];
let lastTitle = null;
const t0 = Date.now() / 1000;
for (;;) {
  const s = await p.evaluate(() => {
    const ph = [...document.querySelectorAll("p")].filter((e) => e.textContent === "デモ動画" && e.getBoundingClientRect().width > 0 && getComputedStyle(e.closest("div")).opacity !== "0");
    const title = document.querySelector("header")?.textContent?.slice(0, 40) ?? document.querySelector("#root")?.innerText?.slice(0, 40) ?? "";
    return { ph: ph.map((e) => e.parentElement?.querySelector(".font-mono")?.textContent ?? "?"), ended: window.__qa.ended, audioT: document.querySelector("audio")?.currentTime ?? null, title };
  });
  if (s.ph.length) placeholders.push({ wall: Date.now() / 1000, files: s.ph, audioT: s.audioT });
  if (s.title !== lastTitle) { titles.push({ audioT: s.audioT, title: s.title }); lastTitle = s.title; }
  if (s.ended || Date.now() / 1000 - t0 > 200) break;
  await p.waitForTimeout(250);
}
await p.waitForTimeout(1500);
const end = Date.now() / 1000;
await cdp.send("Page.stopScreencast").catch(() => {});
const qa = await p.evaluate(() => window.__qa);
await b.close();

// 映像（30fps）＋音声（再生開始の時刻に合わせる）
const lines = [];
list.forEach((f, i) => { const next = i + 1 < list.length ? list[i + 1].t : end; lines.push(`file '${f.name}'`, `duration ${Math.max(1 / 60, next - f.t).toFixed(4)}`); });
lines.push(lines[lines.length - 2]);
writeFileSync(path.join(TMP, "list.txt"), lines.join("\n") + "\n");
const first = list[0].t;
const audioOffset = qa.audioStart - first;
const silent = path.join(TMP, "silent.mp4");
execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(TMP, "list.txt"), "-vf", "fps=30,scale=1920:1080,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", "30", "-an", silent]);
const out = path.join(FILM, "preview-full.mp4");
execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", silent, "-itsoffset", audioOffset.toFixed(3), "-i", mp3, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
const rel = (w) => +(w - qa.audioStart).toFixed(2);
const report = {
  audioOffsetInPreview: +audioOffset.toFixed(3),
  narrationEndedAt: qa.ended ? rel(qa.ended) : null,
  videoStarts: qa.videos.map((v) => ({ file: v.file, narrationTime: rel(v.wall) })),
  videoWaits: qa.waits.map((w) => ({ file: w.file, narrationTime: rel(w.wall) })),
  placeholderVisible: placeholders.map((x) => ({ narrationTime: rel(x.wall), files: x.files })),
  frames: list.length,
  slideTitleChanges: titles,
};
writeFileSync(path.join(FILM, "preview_qa.json"), JSON.stringify(report, null, 2));
rmSync(TMP, { recursive: true, force: true });
console.log(JSON.stringify({ offset: report.audioOffsetInPreview, ended: report.narrationEndedAt, starts: report.videoStarts.length, waits: report.videoWaits.length, placeholderSamples: report.placeholderVisible.length }));
