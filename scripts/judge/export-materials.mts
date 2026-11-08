/**
 * 公開デモ（.judge-demo）の架空症例データに、seed の教材を追記する。
 * インメモリの PGlite に公式 seed を流し、本番と同じサービス関数（教材一覧・患者ライブラリ・教材本文・セット）から、
 * まだ fixture にない題名の教材だけを取り出して consultation.json / lessons.json に足す。既存の教材 ID・診察データは変えない。
 *
 *   npx tsx scripts/judge/export-materials.mts            # まだ無い教材・セットを追加
 *   npx tsx scripts/judge/export-materials.mts --refresh  # 既存の教材の本文・確認問題・件数も seed の最新に合わせる（ID・診察データは変えない）
 */
process.env.PGLITE_DATA = "memory://";
// seed と同じ条件（デモ認証・サインアップ可）を、認証モジュールが読み込まれる前にそろえる
process.env.SEED_MODE = "1";
process.env.DEMO_AUTH = "true";
process.env.BETTER_AUTH_SECRET ??= "export-only-not-a-real-secret-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
import { readFileSync, writeFileSync } from "node:fs";

const { ensureMigrated, getDb } = await import("@/server/db/client");
const { seed } = await import("@/server/db/seed");
const { listVisibleMaterials, listTemplates, getVersionContent } = await import("@/server/services/materials");
const { getPatientLibrary } = await import("@/server/services/library");

const dir = ".judge-demo/app/fixtures";
type Fixture = {
  materials: { items: { materialId: string; title: string; primaryDomain: string; [k: string]: unknown }[] };
  library: { items: { materialId: string; title: string; primaryDomain: string; [k: string]: unknown }[]; [k: string]: unknown };
  templates: { templates: { id: string; name: string; description: string | null; scope: string; materials: { id: string; title: string; primaryDomain: string }[] }[] };
  [k: string]: unknown;
};
const fixture = JSON.parse(readFileSync(`${dir}/consultation.json`, "utf8")) as Fixture;
const lessons = JSON.parse(readFileSync(`${dir}/lessons.json`, "utf8")) as Record<string, unknown>;

await ensureMigrated();
const seeded = await seed(getDb());
const orgId = seeded.orgs.get("sakura-general")!;
const patientA = seeded.users.get("patient1@example.com")!;

const visible = await listVisibleMaterials({ orgId });
const lib = await getPatientLibrary(patientA);
const tpls = await listTemplates(orgId);

const idByTitle = new Map(fixture.materials.items.map((m) => [m.title, m.materialId]));
const byDomainTitle = <T extends { primaryDomain: string; title: string }>(a: T, b: T) => a.primaryDomain.localeCompare(b.primaryDomain) || a.title.localeCompare(b.title, "ja");
const refresh = process.argv.includes("--refresh");
let added = 0;
let refreshed = 0;
for (const m of visible) {
  if (idByTitle.has(m.title)) {
    if (!refresh) continue;
    // 既存の教材: ID と版 ID はそのまま、本文・確認問題・件数・要約・学習目標だけを seed の最新に合わせる
    const id = idByTitle.get(m.title)!;
    const v = await getVersionContent(m.versionId);
    const prev = lessons[id] as { title: string; versionId: string } | undefined;
    lessons[id] = {
      title: m.title,
      versionId: prev?.versionId ?? m.versionId,
      slides: v.slides.map((s) => ({ seq: s.seq, title: s.title, body: s.bodyMd, proposition: s.proposition, detail: s.detailMd })),
      questions: v.questions.map((q) => ({ seq: q.seq, stem: q.stem, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, relatedSlide: q.relatedSlideSeq })),
    };
    const counts = { slideCount: v.slides.length, questionCount: v.questions.length };
    for (const it of fixture.materials.items) if (it.materialId === id) Object.assign(it, counts, { summary: m.summary, objectives: m.objectives });
    for (const it of fixture.library.items) if (it.materialId === id) Object.assign(it, counts, { summary: m.summary });
    refreshed++;
    continue;
  }
  idByTitle.set(m.title, m.materialId);
  fixture.materials.items.push({ ...m });
  const li = lib.items.find((x) => x.title === m.title);
  if (li) fixture.library.items.push({ ...li });
  const v = await getVersionContent(m.versionId);
  lessons[m.materialId] = {
    title: m.title,
    versionId: m.versionId,
    slides: v.slides.map((s) => ({ seq: s.seq, title: s.title, body: s.bodyMd, proposition: s.proposition, detail: s.detailMd })),
    questions: v.questions.map((q) => ({ seq: q.seq, stem: q.stem, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, relatedSlide: q.relatedSlideSeq })),
  };
  added++;
}
fixture.materials.items.sort(byDomainTitle);
fixture.library.items.sort(byDomainTitle);

const existingNames = new Set(fixture.templates.templates.map((t) => t.name));
let addedSets = 0;
for (const t of tpls) {
  if (existingNames.has(t.name)) continue;
  fixture.templates.templates.push({
    id: t.id,
    name: t.name,
    description: t.description,
    scope: t.scope,
    materials: t.materials.map((m) => ({ id: idByTitle.get(m.title) ?? m.id, title: m.title, primaryDomain: m.primaryDomain })),
  });
  addedSets++;
}

writeFileSync(`${dir}/consultation.json`, JSON.stringify(fixture));
writeFileSync(`${dir}/lessons.json`, JSON.stringify(lessons));
console.log(`added materials: ${added}, refreshed: ${refreshed}, sets: ${addedSets}; total materials ${fixture.materials.items.length}, library ${fixture.library.items.length}, lessons ${Object.keys(lessons).length}, sets ${fixture.templates.templates.length}`);
process.exit(0);
