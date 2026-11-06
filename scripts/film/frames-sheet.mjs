/**
 * 各クリップの最初と最後のコマの一覧シート（first_last_frames/sheet_phone.jpg・sheet_ipad.jpg）。
 *   FILM: ~/Developer/shiori-demo-film（record-demo-clips.mjs の出力）
 */
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const FILM = process.env.FILM ?? path.join(os.homedir(), "Developer/shiori-demo-film");
const qa = JSON.parse(readFileSync(path.join(FILM, "qa.json"), "utf8"));
const ORDER = ["demo-step1-info", "backup-demo-step1-support-pending", "demo-step1-cost", "demo-step1-quiz", "demo-step1-unsure", "demo-step2-log", "demo-step2-question", "demo-step3-qr", "demo-step3-receive", "demo-step3-claude-summary", "demo-step3-claude-source", "demo-step3-claude-scope", "demo-step3-claude-prescribe", "demo-step4-studio"];
const img = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
const b = await chromium.launch();
for (const dev of ["スマホ", "iPad"]) {
  const items = ORDER.filter((n) => qa[`${n}.mp4`]?.device === dev && existsSync(path.join(FILM, "first_last_frames", `${n}_first.png`)));
  const w = dev === "スマホ" ? 150 : 330;
  const cells = items.map((n) => {
    const q = qa[`${n}.mp4`];
    return `<div class="c"><b>${n}.mp4</b><small>${q.seconds}s・${q.segments} 区間${q.cutsAt?.length ? `（カット ${q.cutsAt.join("s, ")}s）` : ""}・${q.patient}</small><div class="r"><figure><img src="${img(path.join(FILM, "first_last_frames", `${n}_first.png`))}"><figcaption>最初</figcaption></figure><figure><img src="${img(path.join(FILM, "first_last_frames", `${n}_last.png`))}"><figcaption>最後</figcaption></figure></div></div>`;
  });
  const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;font-family:'Hiragino Sans',sans-serif;background:#eef2f2;color:#1f3237}h1{font-size:18px;margin:0 0 12px}
  .g{display:flex;flex-wrap:wrap;gap:14px}.c{background:#fff;border-radius:10px;padding:10px}.c b{display:block;font-size:13px}.c small{display:block;font-size:11px;color:#5a6b6e;margin:2px 0 6px}
  .r{display:flex;gap:8px}figure{margin:0}img{width:${w}px;border:1px solid #cfd8da;display:block}figcaption{font-size:11px;text-align:center;color:#5a6b6e}</style>
  <h1>${dev}のクリップ — 最初と最後のコマ</h1><div class="g">${cells.join("")}</div>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(FILM, "first_last_frames", `sheet_${dev === "スマホ" ? "phone" : "ipad"}.jpg`), fullPage: true, type: "jpeg", quality: 80 });
}
await b.close();
console.log("sheets done");
