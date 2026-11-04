/**
 * 撮影用: 記録済みの Claude の外来間要約（docs/design/phase2/step4/real/02_after_edit.json、18 項目すべて検証済み）を再生用ファイルにする。
 * 生成時と同じ記録（架空の患者A、基準日 2026-11-04、11 月 3 日の手足のしびれを 1/4 に変更した後）をインメモリ DB に再現し、
 * 各文の根拠を内容（ラベルと日時）で現在の ID に対応づけ、現在の検証を通ることを確かめてから書き出す。Claude は呼ばない。
 *   npx tsx scripts/build-intervisit-replay.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
process.env.DATABASE_URL = "";
process.env.PGLITE_DATA = "memory://";
process.env.SEED_DEMO_HISTORY = "1";
process.env.DEMO_AUTH = "true";
process.env.SEED_MODE = "1";
process.env.SEED_FIGURE_REVIEWS = "0";
process.env.DEMO_ANCHOR ??= "2026-11-04T09:00:00+09:00";
process.env.DEMO_PASSWORD ??= "replay-build";
process.env.BETTER_AUTH_SECRET ??= "replay-build-secret-0123456789abcdef0123";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.ANTHROPIC_API_KEY = "";

const ORIGIN = "docs/design/phase2/step4/real/02_after_edit.json";
const OUT = "docs/design/phase2/step4/replay/intervisit_replay.json";

async function main() {
  const { ensureMigrated, getDb } = await import("@/server/db/client");
  const { seed } = await import("@/server/db/seed");
  const { applyReplayEdit } = await import("@/server/db/seed-health");
  const { buildIntervisit } = await import("@/server/services/intervisit");
  const { contentFingerprint, mapReplayItems, validateItems } = await import("@/server/services/intervisit-ai");
  await ensureMigrated();
  const seeded = await seed(getDb());
  const patientId = seeded.users.get("patient1@example.com")!;
  await applyReplayEdit(getDb(), patientId);
  const iv = await buildIntervisit({ patientId });
  const origin = JSON.parse(readFileSync(ORIGIN, "utf8")) as {
    status: string;
    model: string;
    items: { section: string; text: string; sources: { id: string; label: string; at?: string }[] }[];
  };
  if (origin.status !== "ai") throw new Error("記録が検証済みの Claude 出力ではありません");
  const file = {
    generatedOn: "2026-11-04",
    model: origin.model,
    origin: ORIGIN,
    period: { from: iv.period.from, to: iv.period.to },
    fingerprint: contentFingerprint(iv),
    items: origin.items.map((it) => ({
      section: it.section,
      text: it.text,
      sources: it.sources.map((s) => (s.id.startsWith("stat:") ? { stat: s.id } : { label: s.label, at: s.at! })),
    })),
  };
  const mapped = mapReplayItems(file as never, iv);
  const missing = mapped.flatMap((m) => m.sourceIds).filter((x) => x === "missing").length;
  const { valid, rejected, safetyViolation } = validateItems(mapped, iv);
  console.log(`period ${file.period.from}〜${file.period.to} items=${mapped.length} valid=${valid.length} rejected=${rejected.length} missingSources=${missing} safety=${safetyViolation}`);
  for (const r of rejected) console.log("  rejected:", r.reason, "|", mapped[r.index].text);
  if (rejected.length || missing || safetyViolation) throw new Error("再生用の出力が現在の検証を通りません。ファイルは書き出しません");
  writeFileSync(OUT, JSON.stringify(file, null, 2));
  console.log("wrote", OUT, "fingerprint", file.fingerprint);
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
