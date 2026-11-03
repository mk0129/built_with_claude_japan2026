import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { learningProgress, materialSlides, materialVersions, materials, organizations, quizQuestions } from "@/server/db/schema";
import { levelOf, type Level, type Phase } from "@/lib/understanding";
import { listHomeworkForPatient } from "./prescription";
import { computeMaterialScores } from "./scoring";
import { patientOrgIds } from "./learning";

export type LibraryItem = {
  materialId: string;
  /** 開く版: 処方されていれば処方された版、なければ現在公開中の版 */
  versionId: string;
  title: string;
  summary: string | null;
  primaryDomain: string;
  scope: "common" | "org";
  ownerOrgName: string | null;
  slideCount: number;
  questionCount: number;
  /** 処方の有無（最新の処方）。latest = 最新の処方セットに含まれる */
  prescribed: null | { setId: string; createdAt: Date; orgName: string; clinicianName: string; latest: boolean; note: string | null };
  /** 処方されていない教材を自分で学び始めたか */
  selfLearning: boolean;
  phase: Phase;
  lastSlideSeq: number;
  level: Level;
  scorePct: number | null;
  nCorrect: number;
  nWrong: number;
  nUnknown: number;
  completedAt: Date | null;
};

/**
 * 患者の教材一覧（まなぶ）。公開中の教材（共通＋患者に処方したことのある病院の独自教材）と、
 * 処方済みの教材（旧版を含む）を 1 つの一覧にし、処方・進み具合・理解の 3 段階を付ける。
 */
export async function getPatientLibrary(patientId: string, db: Db = getDb()): Promise<{ items: LibraryItem[]; latestSetId: string | null }> {
  const orgIds = await patientOrgIds(patientId, db);
  const visibility = orgIds.length ? or(eq(materials.scope, "common"), and(eq(materials.scope, "org"), inArray(materials.ownerOrgId, orgIds))) : eq(materials.scope, "common");
  const published = await db
    .select({
      materialId: materials.id,
      versionId: materialVersions.id,
      title: materials.title,
      summary: materialVersions.summary,
      primaryDomain: materials.primaryDomain,
      scope: materials.scope,
      ownerOrgName: organizations.name,
      slideCount: sql<number>`(select count(*) from ${materialSlides} where ${materialSlides.materialVersionId} = ${materialVersions.id})`,
      questionCount: sql<number>`(select count(*) from ${quizQuestions} where ${quizQuestions.materialVersionId} = ${materialVersions.id})`,
    })
    .from(materials)
    .innerJoin(materialVersions, eq(materialVersions.id, materials.currentPublishedVersionId))
    .leftJoin(organizations, eq(organizations.id, materials.ownerOrgId))
    .where(and(visibility, eq(materialVersions.status, "published")));

  const sets = await listHomeworkForPatient(patientId, db);
  const latestSetId = sets[0]?.setId ?? null;
  // 教材ごとの最新処方（sets は新しい順）
  const rxByMaterial = new Map<string, { setId: string; createdAt: Date; orgName: string; clinicianName: string; item: (typeof sets)[number]["items"][number] }>();
  for (const s of sets)
    for (const i of s.items)
      if (!rxByMaterial.has(i.materialId)) rxByMaterial.set(i.materialId, { setId: s.setId, createdAt: s.createdAt, orgName: s.orgName, clinicianName: s.clinicianName, item: i });

  const ids = [...new Set([...published.map((p) => p.materialId), ...rxByMaterial.keys()])];
  const scores = new Map((await computeMaterialScores(patientId, ids, db)).map((s) => [s.materialId, s]));
  const versionIds = published.map((p) => p.versionId);
  const progress = versionIds.length
    ? await db.select().from(learningProgress).where(and(eq(learningProgress.patientId, patientId), inArray(learningProgress.materialVersionId, versionIds)))
    : [];
  const progressByVersion = new Map(progress.map((p) => [p.materialVersionId, p]));

  const items: LibraryItem[] = [];
  const seen = new Set<string>();
  for (const [materialId, rx] of rxByMaterial) {
    const sc = scores.get(materialId);
    const pub = published.find((p) => p.materialId === materialId);
    seen.add(materialId);
    items.push({
      materialId,
      versionId: rx.item.versionId,
      title: rx.item.title,
      summary: rx.item.summary,
      primaryDomain: rx.item.primaryDomain,
      scope: pub?.scope ?? "common",
      ownerOrgName: pub?.ownerOrgName ?? null,
      slideCount: rx.item.slideCount,
      questionCount: rx.item.questionCount,
      prescribed: { setId: rx.setId, createdAt: rx.createdAt, orgName: rx.orgName, clinicianName: rx.clinicianName, latest: rx.setId === latestSetId, note: rx.item.note },
      selfLearning: false,
      phase: rx.item.phase as Phase,
      lastSlideSeq: rx.item.lastSlideSeq,
      level: levelOf(sc),
      scorePct: sc?.scorePct ?? null,
      nCorrect: sc?.nCorrect ?? 0,
      nWrong: sc?.nWrong ?? 0,
      nUnknown: sc?.nUnknown ?? 0,
      completedAt: sc?.completedAt ?? null,
    });
  }
  for (const p of published) {
    if (seen.has(p.materialId)) continue;
    const sc = scores.get(p.materialId);
    const pr = progressByVersion.get(p.versionId);
    const phase: Phase = sc?.attemptId ? "completed" : ((pr?.phase as Phase | undefined) ?? "not_started");
    items.push({
      materialId: p.materialId,
      versionId: p.versionId,
      title: p.title,
      summary: p.summary,
      primaryDomain: p.primaryDomain,
      scope: p.scope,
      ownerOrgName: p.ownerOrgName,
      slideCount: Number(p.slideCount),
      questionCount: Number(p.questionCount),
      prescribed: null,
      selfLearning: phase !== "not_started",
      phase,
      lastSlideSeq: pr?.lastSlideSeq ?? 0,
      level: levelOf(sc),
      scorePct: sc?.scorePct ?? null,
      nCorrect: sc?.nCorrect ?? 0,
      nWrong: sc?.nWrong ?? 0,
      nUnknown: sc?.nUnknown ?? 0,
      completedAt: sc?.completedAt ?? null,
    });
  }
  return { items, latestSetId };
}

/** 理解の地図の対象（処方された教材＋自主学習した教材） */
export function learnedItems(items: LibraryItem[]) {
  return items.filter((i) => i.prescribed || i.selfLearning);
}
