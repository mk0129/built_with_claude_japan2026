import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { learningProgress, materialVersions, materials, prescriptionItems, prescriptionSets, quizAttempts, systemSettings } from "@/server/db/schema";

/**
 * スコア計算（D10, D26, D27, LEARN-06〜10）。
 * - 教材スコア = 現行公開版の評価グループに属する版の、最新「完了」挑戦のスコア
 * - 内部は小数のまま。丸めは UI のみ
 * - 安全上の理由で無効化された版（retire_reason = safety）の挑戦は除外
 * - 新版未評価のとき旧版スコアを平均に含めるかは設定 `scoring.includeOldVersionInAverage`（既定 true）
 */

export type MaterialScore = {
  materialId: string;
  title: string;
  primaryDomain: string;
  currentVersionId: string | null;
  scorePct: number | null; // 集計に使う値（除外・未評価は null）
  isOldVersion: boolean; // 現行版以外の挑戦に基づく
  oldVersionScorePct: number | null; // 旧版の参考値（平均に含めない設定でも表示用に返す）
  attemptId: string | null;
  attemptVersionId: string | null;
  nCorrect: number;
  nWrong: number;
  nUnknown: number;
  nQuestions: number;
  completedAt: Date | null;
};

export async function getSettingBool(key: string, fallback: boolean, db: Db = getDb()): Promise<boolean> {
  const [row] = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return typeof row?.value === "boolean" ? row.value : fallback;
}

/** 患者に処方されたことのある教材ID（重複なし） */
export async function prescribedMaterialIds(patientId: string, db: Db = getDb()): Promise<string[]> {
  const rows = await db
    .selectDistinct({ materialId: prescriptionItems.materialId })
    .from(prescriptionItems)
    .innerJoin(prescriptionSets, eq(prescriptionSets.id, prescriptionItems.setId))
    .where(eq(prescriptionSets.patientId, patientId));
  return rows.map((r) => r.materialId);
}

/** 患者が自主学習した教材ID（処方されていない教材で、進捗または確認問題の挑戦があるもの） */
export async function selfLearnedMaterialIds(patientId: string, db: Db = getDb()): Promise<string[]> {
  const prescribed = new Set(await prescribedMaterialIds(patientId, db));
  const viaProgress = await db
    .selectDistinct({ materialId: materialVersions.materialId })
    .from(learningProgress)
    .innerJoin(materialVersions, eq(materialVersions.id, learningProgress.materialVersionId))
    .where(eq(learningProgress.patientId, patientId));
  const viaAttempts = await db
    .selectDistinct({ materialId: materialVersions.materialId })
    .from(quizAttempts)
    .innerJoin(materialVersions, eq(materialVersions.id, quizAttempts.materialVersionId))
    .where(eq(quizAttempts.patientId, patientId));
  return [...new Set([...viaProgress, ...viaAttempts].map((r) => r.materialId))].filter((id) => !prescribed.has(id));
}

/** 理解の集計対象: 処方された教材＋自主学習した教材 */
export async function learnedMaterialIds(patientId: string, db: Db = getDb()): Promise<string[]> {
  return [...new Set([...(await prescribedMaterialIds(patientId, db)), ...(await selfLearnedMaterialIds(patientId, db))])];
}

export async function computeMaterialScores(patientId: string, materialIds?: string[], db: Db = getDb()): Promise<MaterialScore[]> {
  const ids = materialIds ?? (await learnedMaterialIds(patientId, db));
  if (ids.length === 0) return [];
  const includeOld = await getSettingBool("scoring.includeOldVersionInAverage", true, db);

  const mats = await db
    .select({ id: materials.id, title: materials.title, primaryDomain: materials.primaryDomain, currentVersionId: materials.currentPublishedVersionId })
    .from(materials)
    .where(inArray(materials.id, ids));
  const versions = await db
    .select({
      id: materialVersions.id,
      materialId: materialVersions.materialId,
      evaluationGroupId: materialVersions.evaluationGroupId,
      retireReason: materialVersions.retireReason,
    })
    .from(materialVersions)
    .where(inArray(materialVersions.materialId, ids));
  const versionIds = versions.map((v) => v.id);
  const attempts = versionIds.length
    ? await db
        .select()
        .from(quizAttempts)
        .where(and(eq(quizAttempts.patientId, patientId), inArray(quizAttempts.materialVersionId, versionIds), isNotNull(quizAttempts.completedAt)))
        .orderBy(desc(quizAttempts.completedAt))
    : [];

  const result: MaterialScore[] = [];
  for (const m of mats) {
    const vs = versions.filter((v) => v.materialId === m.id);
    const current = vs.find((v) => v.id === m.currentVersionId) ?? null;
    // 現行版がなければ、この患者に処方された版のうち最新の挑戦がある版の評価グループを使う
    const groupId = current?.evaluationGroupId ?? null;
    const candidateVersionIds = new Set(
      vs.filter((v) => v.retireReason !== "safety" && (groupId === null || v.evaluationGroupId === groupId)).map((v) => v.id),
    );
    // 1) 現行版の評価グループ内の最新完了挑戦（軽微改訂は同グループなので「旧版」扱いにならない）
    // 2) なければ、実質改訂前の旧版（安全上の無効化を除く）の最新完了挑戦を「旧版の結果」として使う（D27）
    const nonSafetyVersionIds = new Set(vs.filter((v) => v.retireReason !== "safety").map((v) => v.id));
    const inGroup = attempts.find((a) => candidateVersionIds.has(a.materialVersionId)) ?? null;
    const latest = inGroup ?? attempts.find((a) => nonSafetyVersionIds.has(a.materialVersionId)) ?? null;
    const isOld = !!latest && !inGroup;
    // 丸めずに件数から再計算する（D26）
    const raw = latest ? (100 * latest.nCorrect) / latest.nQuestions : null;
    result.push({
      materialId: m.id,
      title: m.title,
      primaryDomain: m.primaryDomain,
      currentVersionId: m.currentVersionId,
      scorePct: raw === null ? null : isOld && !includeOld ? null : raw,
      isOldVersion: isOld,
      oldVersionScorePct: isOld ? raw : null,
      attemptId: latest?.id ?? null,
      attemptVersionId: latest?.materialVersionId ?? null,
      nCorrect: latest?.nCorrect ?? 0,
      nWrong: latest?.nWrong ?? 0,
      nUnknown: latest?.nUnknown ?? 0,
      nQuestions: latest?.nQuestions ?? 0,
      completedAt: latest?.completedAt ?? null,
    });
  }
  return result;
}

export function average(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export type ScoreSummary = {
  overall: { score: number | null; evaluated: number; total: number };
  byDomain: { domain: string; score: number | null; evaluated: number; total: number }[];
  materials: MaterialScore[];
};

/** 全体（教材単位の単純平均）と領域別。評価0件は null（UI で「未評価」） */
export async function computeScoreSummary(patientId: string, db: Db = getDb()): Promise<ScoreSummary> {
  const ms = await computeMaterialScores(patientId, undefined, db);
  const byDomainMap = new Map<string, MaterialScore[]>();
  for (const m of ms) byDomainMap.set(m.primaryDomain, [...(byDomainMap.get(m.primaryDomain) ?? []), m]);
  return {
    overall: { score: average(ms.map((m) => m.scorePct)), evaluated: ms.filter((m) => m.scorePct !== null).length, total: ms.length },
    byDomain: [...byDomainMap.entries()].map(([domain, list]) => ({
      domain,
      score: average(list.map((m) => m.scorePct)),
      evaluated: list.filter((m) => m.scorePct !== null).length,
      total: list.length,
    })),
    materials: ms,
  };
}

/** 宿題セット単位のスコア（セット内教材の評価済みスコアの平均）と完了数 */
export async function computeHomeworkScore(setId: string, patientId: string, db: Db = getDb()) {
  const items = await db.select({ materialId: prescriptionItems.materialId }).from(prescriptionItems).where(eq(prescriptionItems.setId, setId));
  const ms = await computeMaterialScores(patientId, items.map((i) => i.materialId), db);
  return {
    score: average(ms.map((m) => m.scorePct)),
    completedCount: ms.filter((m) => m.attemptId !== null).length,
    assignedCount: items.length,
    materials: ms,
  };
}
