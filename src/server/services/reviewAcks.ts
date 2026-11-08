import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { patientReviewAcks } from "@/server/db/schema";
import { badRequest } from "@/server/authz/errors";
import { audit } from "./audit";

/**
 * 「もう一度確認したいこと」の既読（「理解した」）。患者本人だけが付け外しできる。
 * 教材ごとに 1 件。理解したと記録した時点の理解確認の完了日時を持ち、画面側はその完了日時と一致する間だけ一覧から外す
 * （あらためて理解確認を受けてまた間違えたら戻る）。採点・学習の記録そのものには触れない。
 */
export async function listReviewAcks(patientId: string, db: Db = getDb()) {
  const rows = await db
    .select({ materialId: patientReviewAcks.materialId, attemptCompletedAt: patientReviewAcks.attemptCompletedAt, ackedAt: patientReviewAcks.ackedAt })
    .from(patientReviewAcks)
    .where(eq(patientReviewAcks.patientId, patientId));
  return rows.map((r) => ({ materialId: r.materialId, attemptCompletedAt: r.attemptCompletedAt?.toISOString() ?? null, ackedAt: r.ackedAt.toISOString() }));
}

export async function ackReview(patientId: string, input: { materialId?: unknown; completedAt?: unknown }, db: Db = getDb()) {
  const materialId = typeof input.materialId === "string" ? input.materialId : "";
  if (!/^[0-9a-f-]{36}$/i.test(materialId)) throw badRequest("REVIEW_ACK_INVALID", "教材の指定が正しくありません");
  let completedAt: Date | null = null;
  if (input.completedAt !== null && input.completedAt !== undefined) {
    const d = new Date(String(input.completedAt));
    if (Number.isNaN(d.getTime())) throw badRequest("REVIEW_ACK_INVALID", "日時の指定が正しくありません");
    completedAt = d;
  }
  await db.delete(patientReviewAcks).where(and(eq(patientReviewAcks.patientId, patientId), eq(patientReviewAcks.materialId, materialId)));
  await db.insert(patientReviewAcks).values({ patientId, materialId, attemptCompletedAt: completedAt });
  await audit({ actorUserId: patientId, action: "review.ack", resourceType: "material", resourceId: materialId, outcome: "ok" }, db);
  return listReviewAcks(patientId, db);
}

export async function unackReview(patientId: string, materialId: string, db: Db = getDb()) {
  await db.delete(patientReviewAcks).where(and(eq(patientReviewAcks.patientId, patientId), eq(patientReviewAcks.materialId, materialId)));
  await audit({ actorUserId: patientId, action: "review.unack", resourceType: "material", resourceId: materialId, outcome: "ok" }, db);
  return listReviewAcks(patientId, db);
}
