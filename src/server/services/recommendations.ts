import { z } from "zod";
import { getDb, type Db } from "@/server/db/client";
import type { ConsultationContext } from "@/server/authz/consultation";
import { getPatientSummary } from "./consultation";
import { listVisibleMaterials } from "./materials";
import { listHealthRecords } from "./health";
import { getSetForSession } from "./prescription";
import { callClaudeStructured, claudeMode, classifyClaudeError, type Generator } from "./claude";
import { recommendMaterials, type RecommendContext, type Recommendation } from "@/lib/recommend";

/**
 * 情報処方のリコメンド（診察サマリーのホーム）。
 * 1. ルールベースで候補と理由を作る（src/lib/recommend.ts。決定論的）
 * 2. Claude が使えるときは、候補の中から今回の外来で優先したい 3 件までを選び、理由を医療者向けに 1 文で言い換える（候補外の教材は提案しない）
 * 3. Claude の出力は教材 ID を候補と照合し、通らなければルールベースの結果をそのまま返す
 * 採用・処方は医療者が判断する。診断・治療の提案はしない。
 */
export type RecommendationView = {
  generator: Generator | "rule";
  model: string | null;
  items: (Recommendation & { aiReason?: string })[];
  /** 候補が 0 件のときの説明 */
  note: string | null;
};

const Schema = z.object({
  items: z.array(z.object({ materialId: z.string(), reason: z.string().max(120) })).max(3),
});

const SYSTEM = `あなたは外来診療を支援するアシスタントです。がん患者の「質問」「症状の記録」「理解確認のつまずき」「未学習の教材」と、処方できる教材の候補が与えられます。
今回の外来で医療者が処方を検討するとよい教材を候補の中から最大 3 件選び、理由を医療者向けに 1 文（60 字以内）で書いてください。
制約: 候補にない教材 ID は出さない。診断・治療方針・緊急度の判断・CTCAE Grade の推定を書かない。患者の原文や記録の値はそのまま引用し、言い換えない。候補が 0 件なら items は空にする。`;

export async function getRecommendations(ctx: ConsultationContext, _opts: { regenerate?: boolean } = {}, db: Db = getDb()): Promise<RecommendationView> {
  const [summary, materials, set] = await Promise.all([getPatientSummary(ctx, db), listVisibleMaterials({ orgId: ctx.orgId }, db), getSetForSession(ctx, db)]);
  const nowIds = new Set(set?.items.map((i) => i.materialId) ?? []);
  const prescribedBefore = new Set(summary.learning.filter((l) => l.prescribed).map((l) => l.materialId));
  const since = new Date(Date.now() - 14 * 864e5);
  const records = await listHealthRecords(ctx.patientId, { from: since }, db);
  const symptomMax = new Map<string, { name: string; max: number }>();
  for (const r of records) for (const s of r.symptoms) symptomMax.set(s.key, { name: s.name, max: Math.max(symptomMax.get(s.key)?.max ?? 0, s.severity) });
  const context: RecommendContext = {
    materials: materials.map((m) => ({ materialId: m.materialId, title: m.title, summary: m.summary, primaryDomain: m.primaryDomain, prescribedNow: nowIds.has(m.materialId), prescribedBefore: prescribedBefore.has(m.materialId) })),
    questions: [
      ...summary.visitNotes.filter((n) => !n.resolvedAt).map((n) => ({ id: `vn:${n.id}`, body: n.body, materialId: n.materialId })),
      ...summary.questions.filter((q) => q.freeText).map((q) => ({ id: q.feedbackId, body: q.freeText!, materialId: q.materialId })),
    ],
    misses: summary.answers.filter((a) => !a.isCorrect).map((a) => ({ materialId: a.materialId, materialTitle: a.materialTitle, stem: a.stem, isUnknown: a.isUnknown })),
    symptoms: [...symptomMax.entries()].map(([key, v]) => ({ key, ...v })),
    unlearned: summary.learning.filter((l) => l.prescribed && l.phase !== "completed").map((l) => ({ materialId: l.materialId, title: l.title, phase: l.phase })),
  };
  const rule = recommendMaterials(context, 5);
  const note = rule.length ? null : "質問・症状・理解確認のつまずき・未学習の教材がないため、候補はありません。";
  if (!rule.length || !claudeMode()) return { generator: "rule", model: null, items: rule.slice(0, 3), note };
  try {
    const user = JSON.stringify({
      questions: context.questions.map((q) => q.body),
      symptoms: context.symptoms.filter((s) => s.max >= 2).map((s) => `${s.name} 最大${s.max}/4`),
      misses: context.misses.map((m) => `${m.materialTitle}: 「${m.stem}」に${m.isUnknown ? "わからない" : "誤答"}`),
      unlearned: context.unlearned.map((u) => u.title),
      candidates: rule.map((r) => ({ materialId: r.materialId, title: r.title, reasons: r.reasons.map((x) => x.text), rePrescribe: r.rePrescribe })),
    });
    const r = await callClaudeStructured({ system: SYSTEM, user, schema: Schema, schemaName: "prescription_recommendations", maxTokens: 2000 });
    const picked = r.data.items
      .map((it) => {
        const base = rule.find((x) => x.materialId === it.materialId);
        return base ? { ...base, aiReason: it.reason } : null;
      })
      .filter((x): x is Recommendation & { aiReason: string } => !!x);
    if (!picked.length) return { generator: "rule", model: null, items: rule.slice(0, 3), note };
    return { generator: r.generator, model: r.model, items: picked, note: null };
  } catch (e) {
    void classifyClaudeError(e);
    return { generator: "rule", model: null, items: rule.slice(0, 3), note };
  }
}
