/**
 * 教材生成の品質を、架空の原稿 1 本で確かめる（実 API。1 回の実行で構成案 1 回＋本文 1 回 = 2 呼び出し）。
 * 規約（docs/design/materials_style_guide_20261108.md）の機械チェックと、原資料との照合（validateMaterial）を同じ尺度で出す。
 *
 *   set -a; source <(grep -E '^ANTHROPIC_API_KEY=' ~/Developer/shiori/.env.local); set +a   # 値は表示しない
 *   CLAUDE_MAX_CALLS=8 npx tsx scripts/gen-quality/run.mts --out docs/design/gen_quality_20261108/run_v2_1.json
 *   npx tsx scripts/gen-quality/run.mts --score docs/design/phase2/step5/real/generation.json   # API を呼ばず、記録済みの出力を採点
 *   npx tsx scripts/gen-quality/run.mts --outline docs/design/gen_quality_20261108/run_v2_1.json --out …   # 構成案を再利用して本文だけ（1 呼び出し）
 *
 * 原資料はデモ用に作成した架空の原稿（tests/fixtures/sources/hormone_therapy_detailed_demo.docx）だけ。実患者の資料は使わない。
 */
process.env.PGLITE_DATA ??= "memory://";
process.env.BETTER_AUTH_SECRET ??= "gen-quality-not-a-real-secret-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { MaterialOutput, OutlineOutput, MustCoverInputItem } from "@/server/services/ai-prompts";

const args = process.argv.slice(2);
const opt = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (f: string) => args.includes(f);

const { checkMaterialQuality, formatIssue, qualityScore, isSituationalStem } = await import("@/lib/material-quality");
const { validateMaterial, matchMustCover } = await import("@/server/services/ai-generation");
const { balanceAnswerPositions } = await import("@/server/services/quiz-balance");
const { SYSTEM, outlinePrompt, materialPrompt, OutlineSchema, MaterialSchema } = await import("@/server/services/ai-prompts");

const sourcePath = opt("--source") ?? "tests/fixtures/sources/hormone_therapy_detailed_demo.docx";
const SOURCE_ID = "s1";

async function loadSource() {
  const { extractText, detectKind } = await import("@/server/services/extract");
  const buf = readFileSync(sourcePath);
  const kind = detectKind(sourcePath, "")!;
  const ex = await extractText(buf, kind);
  return [{ id: SOURCE_ID, title: "乳がんのホルモン療法を受ける方へ（架空）", extractedText: ex.text }];
}

type Report = {
  score: number;
  issues: string[];
  validation: { errors: string[]; warnings: string[] };
  stats: { slides: number; questions: number; situational: number; correctPositions: number[]; bodyLengths: number[]; propositionLengths: number[]; optionLengthRatio: number[]; longestIsCorrect: number; quoteMismatch: number };
};
function report(material: MaterialOutput, sources: { id: string; extractedText: string | null }[]): Report {
  const issues = checkMaterialQuality({ title: material.title, slides: material.slides, questions: material.questions });
  const v = validateMaterial(material, sources);
  const len = (s: string) => [...s].length;
  return {
    score: qualityScore(issues),
    issues: issues.map((i) => `[${i.code}] ${formatIssue(i)}`),
    validation: v,
    stats: {
      slides: material.slides.length,
      questions: material.questions.length,
      situational: material.questions.filter((q) => isSituationalStem(q.stem)).length,
      correctPositions: material.questions.map((q) => q.correctIndex),
      bodyLengths: material.slides.map((s) => len(s.body)),
      propositionLengths: material.slides.map((s) => len(s.proposition)),
      optionLengthRatio: material.questions.map((q) => {
        const L = q.options.map(len);
        return Math.round((Math.max(...L) / Math.max(1, Math.min(...L))) * 100) / 100;
      }),
      longestIsCorrect: material.questions.filter((q) => {
        const L = q.options.map(len);
        return L.indexOf(Math.max(...L)) === q.correctIndex && L.filter((x) => x === Math.max(...L)).length === 1;
      }).length,
      quoteMismatch: v.warnings.filter((w) => /見つかりません/.test(w)).length,
    },
  };
}

function dump(material: MaterialOutput) {
  const lines: string[] = [];
  lines.push(`# ${material.title} — ${material.summary}`);
  material.slides.forEach((s, i) => lines.push(`\n## 画面 ${i + 1}: ${s.title}\n要点: ${s.proposition}\n本文: ${s.body}\n補足: ${s.detail || "（なし）"}`));
  material.questions.forEach((q, i) => lines.push(`\n### 問 ${i + 1}（画面 ${q.relatedSlide}）: ${q.stem}\n${q.options.map((o, j) => `  ${j === q.correctIndex ? "◎" : "・"} ${o}`).join("\n")}\n解説: ${q.explanation}`));
  if (material.notCoveredBySource.length) lines.push(`\n原資料にないため書かなかったこと: ${material.notCoveredBySource.join(" / ")}`);
  return lines.join("\n");
}

const scorePath = opt("--score");
if (scorePath) {
  // API を呼ばず、記録済みの出力（generation.json または本スクリプトの出力）を採点する
  const g = JSON.parse(readFileSync(scorePath, "utf8"));
  // ジョブの記録（generation.json）はアプリが付けた validationWarnings / originalCorrectIndices を含むので除く
  const raw: Record<string, unknown> = g.draft?.output ? { ...g.draft.output } : { ...g.material };
  delete raw.validationWarnings;
  delete raw.originalCorrectIndices;
  const material: MaterialOutput = MaterialSchema.parse(raw);
  const sources = await loadSource();
  const r = report(material, sources);
  console.log(JSON.stringify({ file: scorePath, ...r }, null, 2));
  console.log("\n" + dump(material));
  process.exit(0);
}

const outPath = opt("--out") ?? `docs/design/gen_quality_20261108/run_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const sources = await loadSource();
const { callClaudeStructured, claudeMode } = await import("@/server/services/claude");
if (claudeMode() !== "claude") throw new Error("ANTHROPIC_API_KEY が設定されていません（値は表示しません）");
if (!process.env.CLAUDE_MAX_CALLS) throw new Error("CLAUDE_MAX_CALLS を設定してください（課金の上限）");

let outline: OutlineOutput;
let outlineUsage: Record<string, unknown> | null = null;
const reuse = opt("--outline");
if (reuse) {
  const prev = JSON.parse(readFileSync(reuse, "utf8"));
  outline = OutlineSchema.parse(prev.outline);
  console.log(`構成案を再利用: ${reuse}`);
} else {
  const r = await callClaudeStructured({ system: SYSTEM, user: outlinePrompt(sources), schema: OutlineSchema, schemaName: "outline", maxTokens: 32000, high: flag("--high") });
  outline = r.data;
  outlineUsage = { model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, durationMs: r.durationMs, stopReason: r.stopReason };
  console.log(`構成案: ${outline.outlines.length} 案 / 必須事項の候補 ${outline.mustCoverCandidates.length} 件 / ${r.inputTokens}→${r.outputTokens} tokens / ${r.durationMs} ms`);
}
if (flag("--outline-only")) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ generatedOn: new Date().toISOString().slice(0, 10), promptVersion: "2026-11-08", source: sourcePath, outlineUsage, outline }, null, 2) + "\n");
  console.log(JSON.stringify(outline.outlines.map((o) => ({ title: o.title, targetReader: o.targetReader, slideTitles: o.slideTitles })), null, 2));
  console.log(`構成案だけを保存: ${outPath}`);
  process.exit(0);
}
const idx = Number(opt("--outline-index") ?? 0);
const o = outline.outlines[idx];
if (!o) throw new Error(`構成案 ${idx + 1} がありません`);
// 医療者が全件「必須」と確定した想定（11/4 の実演と同じ条件）
const mustCover: MustCoverInputItem[] = outline.mustCoverCandidates.map((c, i) => ({ id: `mc${i + 1}`, text: c.text, kind: c.kind, sourceRef: c.sourceRef, status: "required" as const }));
const spec = { title: o.title, audience: o.targetReader, objectives: o.learningObjectives, slideTitles: o.slideTitles, mustCover };
const m = await callClaudeStructured({ system: SYSTEM, user: materialPrompt(sources, spec), schema: MaterialSchema, schemaName: "material", maxTokens: 32000, high: flag("--high") });
const balanced = balanceAnswerPositions(m.data.questions);
const material = { ...m.data, questions: balanced.questions };
const r = report(material, sources);
const must = matchMustCover(mustCover, material);
const out = {
  generatedOn: new Date().toISOString().slice(0, 10),
  promptVersion: "2026-11-08",
  source: sourcePath,
  outlineIndex: idx,
  outlineUsage,
  draftUsage: { model: m.model, inputTokens: m.inputTokens, outputTokens: m.outputTokens, durationMs: m.durationMs, stopReason: m.stopReason },
  balancing: { moved: balanced.moved, warning: balanced.warning, originalCorrectIndices: m.data.questions.map((q) => q.correctIndex) },
  mustCover: { total: must.length, autoMatched: must.filter((x) => x.autoMatched).length, unmatched: must.filter((x) => x.autoMatched === false).map((x) => x.text) },
  report: r,
  outline,
  material,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`本文: ${material.slides.length} 画面 / ${material.questions.length} 問 / ${m.inputTokens}→${m.outputTokens} tokens / ${m.durationMs} ms / 点数 ${r.score}`);
console.log(JSON.stringify({ stats: r.stats, issues: r.issues, validation: r.validation, mustCover: out.mustCover, balancing: out.balancing }, null, 2));
console.log("\n" + dump(material));
console.log(`\nwrote ${outPath}`);
process.exit(0);
