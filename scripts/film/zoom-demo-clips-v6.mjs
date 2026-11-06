#!/usr/bin/env node
/**
 * v6: record-demo-clips-v6.mjs の区間（倍率 3 の原寸）から、寄り（ズーム）とディゾルブを付けた埋め込み用クリップを作る。
 *   FILM   : 親フォルダ（既定 ~/Developer/shiori-demo-film）。入力 FILM/v6/raw/、出力 FILM/v6/clips/（MP4・posters/）と FILM/v6/clips/zoom_plan.json
 *   FFMPEG : ffmpeg のパス
 * 寄りは撮影した画面の拡大だけ（文字の描き直し・早送りなし）。寄りの範囲は撮影時に測った要素の位置（events.json の CSS px）から決める。
 * 出力は v5 と同じ 2360×1640・30fps・H.264（HTML の iPad 枠に object-cover で入る）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const FILM = process.env.FILM ?? path.join(os.homedir(), "Developer/shiori-demo-film");
const RAW = path.join(FILM, "v6", "raw");
const OUT = path.join(FILM, "v6", "clips");
const FFMPEG = process.env.FFMPEG;
if (!FFMPEG || !existsSync(FFMPEG)) throw new Error("FFMPEG（ffmpeg のパス）を指定してください");
mkdirSync(path.join(OUT, "posters"), { recursive: true });
const ev = JSON.parse(readFileSync(path.join(RAW, "events.json"), "utf8"));
const { vp, dpr } = ev.device;
const W = vp.width * dpr, AR = vp.width / vp.height;
const OW = 2360, OH = 1640, XF = 0.3;

/** 中心 (cx, cy)・幅 w（CSS px）の寄りの範囲。画面からはみ出さないように寄せる */
function box(cx, cy, w) {
  const h = w / AR;
  const x = Math.min(Math.max(cx - w / 2, 0), vp.width - w), y = Math.min(Math.max(cy - h / 2, 0), vp.height - h);
  return { x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) };
}
/**
 * zoompan の式。moves: [{ a, b, to }]（区間の a〜b 秒で、to の範囲へなめらかに寄る。to=null は全体）。
 * 範囲の幅と左上を、全体 → 寄り の 0〜1（smoothstep）で補間する。
 */
function zoompan(moves) {
  const P = (a, b) => `clip((in/30-${a})/${(b - a).toFixed(3)},0,1)`;
  const S = (a, b) => `(${P(a, b)}*${P(a, b)}*(3-2*${P(a, b)}))`;
  // 寄りの度合い e(t)：寄るたびに +、引くたびに -（同じ範囲へ寄って戻る使い方だけ）
  const target = moves.find((m) => m.to)?.to;
  const e = moves.map((m) => (m.to ? `+${S(m.a, m.b)}` : `-${S(m.a, m.b)}`)).join("");
  const wpx = `(${W}-${(W - target.w * dpr).toFixed(1)}*(${e}))`;
  return `zoompan=z='${W}/${wpx}':x='${(target.x * dpr).toFixed(1)}*(${e})':y='${(target.y * dpr).toFixed(1)}*(${e})':d=1:s=${OW}x${OH}:fps=30`;
}
const ENC = ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-r", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"];
function poster(file) {
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", path.join(OUT, file), "-frames:v", "1", "-vf", "scale=1180:820:flags=lanczos", "-q:v", "3", path.join(OUT, "posters", file.replace(/\.mp4$/, ".jpg"))]);
}
const plan = {};

// ---- #10 demo-step3-claude-summary.mp4：全体（医療者の画面）→「手のしびれは…？」と「根拠 1件」に寄る → 元の全体へ ----
{
  const s = ev.summary;
  const left = s.quote[0] - 9, right = s.evidence[2] + 9;
  const to = box((left + right) / 2, (s.quote[1] + s.quote[3]) / 2, right - left);
  const moves = [{ a: 1.9, b: 2.6, to }, { a: 5.6, b: 6.2, to: null }];
  const file = "demo-step3-claude-summary.mp4";
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", path.join(RAW, "summary.mp4"),
    "-vf", `trim=0:9.2,setpts=PTS-STARTPTS,fps=30,${zoompan(moves)},format=yuv420p`, ...ENC, path.join(OUT, file)]);
  poster(file);
  plan[file] = { seconds: 9.2, zoomTo: to, zoomInStart: 1.9, zoomInEnd: 2.6, readableFrom: 2.6, readableTo: 5.6, zoomOutStart: 5.6, zoomOutEnd: 6.2, target: "「手のしびれは、治療が終わったら戻りますか？」＋「根拠 1件」" };
}

// ---- #14 demo-step4-studio.mp4：施設の資料 → Claude の教材ドラフト（記録済み出力の再生の表示に軽く寄る）→ 承認・公開 → 同じカードに寄って「処方に追加」→「選択済み」 ----
{
  const s3 = ev.segments.studio3, s4 = ev.segments.studio4;
  const o1 = 4.8, o2 = 7.0, o3 = 8.05; // ディゾルブの開始（クリップの時刻）
  const clickAt = 8.85; // 「処方に追加」を押す時刻（クリップの時刻）
  const t3 = 0.3, t4 = +(s4.marks.click - (clickAt - o3)).toFixed(3); // 区間 3・4 の頭を詰める量
  const len = [o1 + XF, o2 - o1 + XF, o3 - o2 + XF, +(s4.seconds - t4).toFixed(3)];
  const b = ev.studio2.banner, c = ev.studio4.card;
  const bannerTo = box((b[0] + b[2]) / 2, b[1] - 70 + (b[2] - b[0] + 33) / AR / 2, b[2] - b[0] + 33);
  const cardH = c[3] - c[1] + 36;
  const cardTo = box((c[0] + c[2]) / 2, (c[1] + c[3]) / 2, Math.max(c[2] - c[0] + 40, cardH * AR));
  const z2 = zoompan([{ a: 0.35, b: 0.8, to: bannerTo }]);
  const z4 = zoompan([{ a: 0.25, b: 0.7, to: cardTo }]);
  const file = "demo-step4-studio.mp4";
  const f = [
    `[0:v]trim=0:${len[0]},setpts=PTS-STARTPTS,fps=30,scale=${OW}:${OH}:flags=lanczos,format=yuv420p[a]`,
    `[1:v]trim=0:${len[1]},setpts=PTS-STARTPTS,fps=30,${z2},format=yuv420p[b]`,
    `[2:v]trim=${t3}:${t3 + len[2]},setpts=PTS-STARTPTS,fps=30,scale=${OW}:${OH}:flags=lanczos,format=yuv420p[c]`,
    `[3:v]trim=${t4},setpts=PTS-STARTPTS,fps=30,${z4},format=yuv420p[d]`,
    `[a][b]xfade=transition=fade:duration=${XF}:offset=${o1}[ab]`,
    `[ab][c]xfade=transition=fade:duration=${XF}:offset=${o2}[abc]`,
    `[abc][d]xfade=transition=fade:duration=${XF}:offset=${o3}[v]`,
  ].join(";");
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", ...["studio1", "studio2", "studio3", "studio4"].flatMap((n) => ["-i", path.join(RAW, `${n}.mp4`)]),
    "-filter_complex", f, "-map", "[v]", ...ENC, path.join(OUT, file)]);
  poster(file);
  const end = +(o3 + len[3]).toFixed(3);
  plan[file] = {
    seconds: end,
    scenes: [
      { name: "施設の資料（架空の院内資料を登録・利用許諾と個人情報の確認）", from: 0, to: o1 },
      { name: "Claudeの教材ドラフト（記録済みのClaude出力の再生の表示）", from: o1, to: o2, zoomTo: bannerTo, zoomInStart: +(o1 + 0.35).toFixed(2), zoomInEnd: +(o1 + 0.8).toFixed(2), readableFrom: +(o1 + 0.8).toFixed(2), readableTo: o2 },
      { name: "医療者の承認・公開", from: o2, to: o3, approveClickAt: +(o2 + s3.marks.approve - t3).toFixed(3), publishedAt: +(o2 + s3.marks.published - t3).toFixed(3) },
      { name: "教材ライブラリ：同じカードの「処方に追加」→「選択済み」", from: o3, to: end, zoomTo: cardTo, zoomInStart: +(o3 + 0.25).toFixed(2), zoomInEnd: +(o3 + 0.7).toFixed(2), clickAt, selectedAt: +(o3 + s4.marks.selected - t4).toFixed(3) },
    ],
    dissolves: [o1, o2, o3],
  };
}
writeFileSync(path.join(OUT, "zoom_plan.json"), JSON.stringify(plan, null, 2));
console.log(JSON.stringify(plan, null, 2));
