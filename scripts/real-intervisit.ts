/**
 * 外来間要約の実 Claude API 検証（Phase 2 Step 4-C）。自動テストとは分離し、明示的に実行したときだけ API を呼ぶ。
 *   npm run intervisit:real -- --dry   … API を呼ばず、送るデータの大きさ（文字数・概算トークン）だけを表示
 *   npm run intervisit:real            … 実 API を 2 回呼ぶ（生成 → 元データを 1 件変更して再生成）
 * 対象: インメモリ DB に投入した架空のデモ患者A（patient1@example.com）の体調記録・学習・質問だけ。実患者データは使わない。
 * 結果（要約・根拠 ID・検証結果・トークン数）を docs/design/phase2/step4/real/ に保存する。
 */
import { mkdirSync, writeFileSync } from "node:fs";
process.env.DATABASE_URL = "";
process.env.PGLITE_DATA = "memory://";
process.env.SEED_DEMO_HISTORY = "1";
process.env.DEMO_AUTH = "true";
process.env.SEED_MODE = "1";
process.env.SEED_FIGURE_REVIEWS = "0";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.CLAUDE_FAKE = "";
process.env.DEMO_PASSWORD ??= "real-intervisit-demo";
process.env.BETTER_AUTH_SECRET ??= "real-intervisit-secret-0123456789abcdef0123";

const dry = process.argv.includes("--dry");
const OUT = "docs/design/phase2/step4/real";

async function main() {
  // 安全確認: インメモリ DB 以外（本番・共有 DB・ローカルの実データ）なら実行しない
  if (process.env.DATABASE_URL || process.env.PGLITE_DATA !== "memory://") throw new Error("インメモリ DB 以外では実行しません");
  const { ensureMigrated, getDb } = await import("@/server/db/client");
  const { seed } = await import("@/server/db/seed");
  const { buildIntervisit } = await import("@/server/services/intervisit");
  const { summarizeIntervisit, validateItems } = await import("@/server/services/intervisit-ai");
  const { sourceIndex } = await import("@/server/services/intervisit-rules");
  const { healthRecords, healthSymptomEntries } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  await ensureMigrated();
  const seeded = await seed(getDb());
  // 安全確認: DB の患者がすべて架空のデモアカウント（@example.com）であること
  const { user } = await import("@/server/db/schema");
  const all = await getDb().select({ email: user.email }).from(user);
  if (all.some((u) => !u.email.toLowerCase().endsWith("@example.com"))) throw new Error("架空のデモアカウント以外が含まれるため実行しません");
  const patientId = seeded.users.get("patient1@example.com")!;
  const iv = await buildIntervisit({ patientId });
  const sources = sourceIndex(iv);
  const approxChars = JSON.stringify([...sources.entries()]).length + JSON.stringify(iv.symptoms).length + JSON.stringify(iv.learning).length + 2500;
  console.log(`対象: 架空の患者A / 期間 ${iv.period.from}〜${iv.period.to} / 出来事 ${iv.events.length} 件 / 根拠 ID ${sources.size} 件 / 入力の概算 ${approxChars} 文字（約 ${Math.round(approxChars / 1.5)} トークン以下）`);
  if (dry) return;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY がありません（.env.local）");
  mkdirSync(OUT, { recursive: true });
  const run = async (label: string) => {
    const cur = await buildIntervisit({ patientId });
    const r = await summarizeIntervisit(cur, { sessionId: `real-${label}`, fictional: true, regenerate: true });
    const check = r.status === "ai" ? validateItems(r.items, cur) : null;
    const idx = sourceIndex(cur);
    const report = {
      label,
      status: r.status,
      model: r.model,
      usage: r.usage,
      fallbackReason: r.fallbackReason,
      rejected: r.rejected,
      rejectedItems: r.rejectedItems ?? [],
      items: r.items.map((it) => ({ ...it, sources: it.sourceIds.map((id) => ({ id, ...idx.get(id) })) })),
      revalidated: check ? { valid: check.valid.length, rejected: check.rejected.length } : null,
    };
    writeFileSync(`${OUT}/${label}.json`, JSON.stringify(report, null, 2));
    console.log(`\n== ${label}: ${r.status} ${r.model} tokens in=${r.usage?.inputTokens} out=${r.usage?.outputTokens} 不採用 ${r.rejected.length}`);
    for (const it of r.items) console.log(`[${it.section}] ${it.text}  ← ${it.sourceIds.join(", ")}`);
    return r;
  };
  await run("01_initial");
  // 元データの変更: 最も新しい記録の「手足のしびれ」を 1/4 に変更して再生成
  const rows = await getDb().select({ id: healthRecords.id, at: healthRecords.measuredAt }).from(healthRecords).where(eq(healthRecords.patientId, patientId));
  const last = rows.sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  await getDb().update(healthSymptomEntries).set({ severity: 1 }).where(and(eq(healthSymptomEntries.recordId, last.id), eq(healthSymptomEntries.symptomKey, "numbness")));
  console.log(`\n元データを変更: 記録 ${last.id} の手足のしびれ → 1/4`);
  await run("02_after_edit");
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
