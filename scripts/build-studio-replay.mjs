// 撮影用: 2026-11-04 の実 API 生成（構成案 1 回＋本文 1 回）で記録した Claude の出力を、再生用ファイルにまとめる。
// 本文の記録はアプリが付けた validationWarnings を除き、Claude が返した内容だけにする。API は呼ばない。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "docs/design/phase2/step5/real/generation.json";
const FIXTURE = "tests/fixtures/sources/hormone_therapy_detailed_demo.docx";
const OUT = "docs/design/phase2/step5/replay/studio_replay.json";

const g = JSON.parse(readFileSync(SRC, "utf8"));
if (g.outline.generator !== "claude" || g.draft.generator !== "claude") throw new Error("Claude による記録ではありません");
const { validationWarnings: _w, originalCorrectIndices: _o, ...material } = g.draft.output;
const outlineIndex = g.outline.output.outlines.findIndex((o) => o.title === material.title);
if (outlineIndex < 0) throw new Error("本文に対応する構成案が見つかりません");
const out = {
  note: "記録済みの Claude の出力（再生専用）。STUDIO_REPLAY_FILE で指定したデモ環境だけで使う。本番では無効。",
  generatedOn: "2026-11-04",
  model: g.draft.model,
  recordedFrom: SRC,
  sourceFixture: FIXTURE,
  sourceSha256: createHash("sha256").update(readFileSync(FIXTURE)).digest("hex"),
  outlineIndex,
  outline: g.outline.output,
  material,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT}: outlines=${out.outline.outlines.length} outlineIndex=${outlineIndex} slides=${material.slides.length} questions=${material.questions.length} sha=${out.sourceSha256.slice(0, 12)}`);
