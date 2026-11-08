/**
 * シード教材（SEED_CONTENT）を規約（docs/design/materials_style_guide_20261108.md）で点検する。
 *
 *   npx tsx scripts/review/materials-lint.mts            # 一覧と集計。error があれば exit 1
 *   npx tsx scripts/review/materials-lint.mts --strict   # warning もあれば exit 1
 *   npx tsx scripts/review/materials-lint.mts --detail   # 指摘を 1 件ずつ出す
 *   npx tsx scripts/review/materials-lint.mts --json out.json
 *   npx tsx scripts/review/materials-lint.mts --only "手足のしびれ"
 */
import { writeFileSync } from "node:fs";
import { SEED_CONTENT } from "@/server/db/seed-content";
import { checkMaterialQuality, formatIssue, qualityScore, type QualityIssue } from "@/lib/material-quality";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt("--only");

const rows: { title: string; slides: number; questions: number; score: number; issues: QualityIssue[] }[] = [];
for (const m of SEED_CONTENT) {
  if (only && !m.title.includes(only)) continue;
  const issues = checkMaterialQuality({
    title: m.title,
    objectives: m.objectives,
    slides: m.slides.map((s) => ({ title: s.title, proposition: s.proposition, body: s.body, detail: s.detail })),
    questions: m.questions.map((q) => ({ stem: q.stem, options: q.options, correctIndex: q.correct, explanation: q.explanation, relatedSlide: q.relatedSlide })),
  });
  rows.push({ title: m.title, slides: m.slides.length, questions: m.questions.length, score: qualityScore(issues), issues });
}

const pad = (s: string, w: number) => {
  const width = [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e7f ? 2 : 1), 0);
  return s + " ".repeat(Math.max(0, w - width));
};
console.log(pad("教材", 46) + "画面 設問 点数 誤り 注意  主な指摘");
for (const r of rows) {
  const e = r.issues.filter((i) => i.level === "error").length;
  const w = r.issues.length - e;
  const codes = [...new Set(r.issues.map((i) => i.code))].slice(0, 5).join(",");
  console.log(`${pad(r.title.slice(0, 22), 46)}${String(r.slides).padStart(3)} ${String(r.questions).padStart(4)} ${String(r.score).padStart(4)} ${String(e).padStart(4)} ${String(w).padStart(4)}  ${codes}`);
  if (flag("--detail")) for (const i of r.issues) console.log(`    [${i.level === "error" ? "E" : "W"} ${i.code}] ${formatIssue(i)}`);
}
const all = rows.flatMap((r) => r.issues);
const byCode = new Map<string, number>();
for (const i of all) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
const errors = all.filter((i) => i.level === "error").length;
console.log(`\n教材 ${rows.length} 本 / 誤り ${errors} 件 / 注意 ${all.length - errors} 件 / 平均 ${rows.length ? Math.round(rows.reduce((n, r) => n + r.score, 0) / rows.length) : 0} 点`);
console.log([...byCode.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}=${n}`).join("  "));
const out = opt("--json");
if (out) writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
process.exit(errors > 0 || (flag("--strict") && all.length > 0) ? 1 : 0);
