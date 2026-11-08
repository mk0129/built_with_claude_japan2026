// 撮影・審査デモ用: 実 API で記録した Claude の出力を、再生用ファイルにまとめる。API は呼ばない。
//   node scripts/build-studio-replay.mjs                                   # 2026-11-04 の実演の記録（docs/design/phase2/step5/real/generation.json）から
//   node scripts/build-studio-replay.mjs docs/design/gen_quality_20261108/run_v2_1.json   # scripts/gen-quality/run.mts の出力から
// 出力は docs/design/phase2/step5/replay/studio_replay.json と、公開デモが読む .judge-demo/app/fixtures/studio-replay.json の両方。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2] ?? "docs/design/phase2/step5/real/generation.json";
const FIXTURE = "tests/fixtures/sources/hormone_therapy_detailed_demo.docx";
const OUTS = ["docs/design/phase2/step5/replay/studio_replay.json", ".judge-demo/app/fixtures/studio-replay.json"];

const g = JSON.parse(readFileSync(SRC, "utf8"));
let outline, material, outlineIndex, generatedOn, model;
if (g.draft?.output && g.outline?.output) {
  // 実演の記録（ジョブの出力）。アプリが付けた validationWarnings を除き、Claude が返した内容だけにする
  if (g.outline.generator !== "claude" || g.draft.generator !== "claude") throw new Error("Claude による記録ではありません");
  const { validationWarnings: _w, originalCorrectIndices: _o, ...m } = g.draft.output;
  outline = g.outline.output;
  material = m;
  outlineIndex = outline.outlines.findIndex((o) => o.title === material.title);
  generatedOn = "2026-11-04";
  model = g.draft.model;
} else if (g.material && g.outline) {
  // scripts/gen-quality/run.mts の出力（正答位置の均し済み）
  if (g.source && !g.source.endsWith(FIXTURE.split("/").pop())) throw new Error(`原資料が ${FIXTURE} ではありません: ${g.source}`);
  outline = g.outline;
  material = g.material;
  outlineIndex = g.outlineIndex ?? outline.outlines.findIndex((o) => o.title === material.title);
  generatedOn = g.generatedOn;
  model = g.draftUsage?.model ?? "claude-sonnet-5-5";
} else {
  throw new Error("記録の形式が分かりません");
}
if (outlineIndex < 0) throw new Error("本文に対応する構成案が見つかりません");
const out = {
  note: "記録済みの Claude の出力（再生専用）。STUDIO_REPLAY_FILE で指定したデモ環境だけで使う。本番では無効。",
  generatedOn,
  model,
  recordedFrom: SRC,
  sourceFixture: FIXTURE,
  sourceSha256: createHash("sha256").update(readFileSync(FIXTURE)).digest("hex"),
  outlineIndex,
  outline,
  material,
};
for (const OUT of OUTS) writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUTS.join(", ")}: outlines=${out.outline.outlines.length} outlineIndex=${outlineIndex} slides=${material.slides.length} questions=${material.questions.length} model=${model} generatedOn=${generatedOn} sha=${out.sourceSha256.slice(0, 12)}`);
