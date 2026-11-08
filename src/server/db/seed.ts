import { eq } from "drizzle-orm";
import { ensureMigrated, getDb, type Db } from "./client";
import { figureAssets, figurePlacements, materialSlides, materialVersions, materials, organizationMembers, organizations, prescriptionTemplates, quizQuestions, user } from "./schema";
import { DEMO_ACCOUNTS, DEMO_MATERIALS, DEMO_ORGS } from "./seed-data";
import { SEED_CONTENT, SEED_TEMPLATES } from "./seed-content";
import { seedDemoHistory } from "./seed-history";
import { applyReplayEdit, seedDemoHealth } from "./seed-health";
import { replayFile } from "@/server/demo";

/**
 * 架空データの投入（冪等）。
 * - アカウントは Better Auth の signUpEmail 経由で作成し、パスワードハッシュ形式を一致させる
 * - 本番（NODE_ENV=production）では実行しない
 */
export async function seed(db: Db = getDb()) {
  if (process.env.NODE_ENV === "production") throw new Error("seed must not run in production");
  process.env.SEED_MODE = "1";
  process.env.DEMO_AUTH = "true";
  const { auth } = await import("@/server/auth/auth");
  const password = process.env.DEMO_PASSWORD ?? "shiori-demo-2026";

  // 組織
  const orgIdBySlug = new Map<string, string>();
  for (const o of DEMO_ORGS) {
    const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, o.slug)).limit(1);
    if (existing) {
      orgIdBySlug.set(o.slug, existing.id);
      continue;
    }
    const [row] = await db.insert(organizations).values(o).returning({ id: organizations.id });
    orgIdBySlug.set(o.slug, row.id);
  }

  // アカウント
  const userIdByEmail = new Map<string, string>();
  for (const a of DEMO_ACCOUNTS) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, a.email)).limit(1);
    let userId = existing?.id;
    if (!userId) {
      const res = await auth.api.signUpEmail({ body: { email: a.email, password, name: a.name } });
      userId = res.user.id;
    }
    await db.update(user).set({ kind: a.kind, emailVerified: true }).where(eq(user.id, userId));
    userIdByEmail.set(a.email, userId);
    for (const m of a.memberships ?? []) {
      const orgId = orgIdBySlug.get(m.orgSlug)!;
      await db
        .insert(organizationMembers)
        .values({ orgId, userId, roles: m.roles, displayName: m.displayName })
        .onConflictDoUpdate({ target: [organizationMembers.orgId, organizationMembers.userId], set: { roles: m.roles, displayName: m.displayName, active: true } });
    }
  }

  // 教材の骨子
  const editorId = userIdByEmail.get("op.editor@example.com")!;
  const approverId = userIdByEmail.get("op.approver@example.com")!;
  const hospitalEditorId = userIdByEmail.get("nurse.tanaka@example.com")!;
  const hospitalApproverId = userIdByEmail.get("approver.sato@example.com")!;
  const materialIdByTitle = new Map<string, string>();
  for (const m of DEMO_MATERIALS) {
    const [existing] = await db.select({ id: materials.id }).from(materials).where(eq(materials.title, m.title)).limit(1);
    if (existing) {
      materialIdByTitle.set(m.title, existing.id);
      continue;
    }
    const ownerOrgId = m.ownerOrgSlug ? orgIdBySlug.get(m.ownerOrgSlug)! : null;
    const [mat] = await db
      .insert(materials)
      .values({ scope: m.scope, ownerOrgId, primaryDomain: m.primaryDomain, title: m.title, tags: [m.primaryDomain] })
      .returning({ id: materials.id });
    const now = new Date();
    const [ver] = await db
      .insert(materialVersions)
      .values({
        materialId: mat.id,
        versionNo: 1,
        status: "published",
        revisionClass: "initial",
        summary: m.summary,
        createdByUserId: m.scope === "common" ? editorId : hospitalEditorId,
        approvedByUserId: m.scope === "common" ? approverId : hospitalApproverId,
        approvedAt: now,
        publishedAt: now,
        changeNote: "デモ用の初版（骨子のみ。本文・クイズは後続で投入）",
      })
      .returning({ id: materialVersions.id });
    await db.update(materials).set({ currentPublishedVersionId: ver.id }).where(eq(materials.id, mat.id));
    materialIdByTitle.set(m.title, mat.id);
  }

  // 本文・クイズ（版にスライドが無い場合のみ投入）
  for (const c of SEED_CONTENT) {
    const materialId = materialIdByTitle.get(c.title);
    if (!materialId) continue;
    const [mat] = await db.select({ versionId: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, materialId)).limit(1);
    if (!mat?.versionId) continue;
    const [hasSlide] = await db.select({ id: materialSlides.id }).from(materialSlides).where(eq(materialSlides.materialVersionId, mat.versionId)).limit(1);
    if (hasSlide) continue;
    await db.update(materialVersions).set({ learningObjectives: c.objectives }).where(eq(materialVersions.id, mat.versionId));
    await db.insert(materialSlides).values(
      c.slides.map((sl, i) => ({ materialVersionId: mat.versionId!, seq: i + 1, title: sl.title, bodyMd: sl.body, imageRef: sl.image ?? null, voiceText: sl.body, proposition: sl.proposition ?? null, detailMd: sl.detail ?? null })),
    );
    await db.insert(quizQuestions).values(
      c.questions.map((q, i) => ({
        materialVersionId: mat.versionId!,
        seq: i + 1,
        stem: q.stem,
        options: q.options,
        correctIndex: q.correct,
        explanation: q.explanation,
        relatedSlideSeq: q.relatedSlide,
      })),
    );
  }

  // 図解アセット（仕様のみ・未納品・監修待ち）。患者には配信されない
  const { SEED_FIGURES } = await import("./seed-figures");
  const { existsSync } = await import("node:fs");
  for (const f of SEED_FIGURES) {
    // 納品済みファイルが public にあれば登録。装飾（editorial）は医学的監修の対象外なので公開可 = approved とする。
    // 医学的図解（medical）は納品済みでも pending_review のまま（監修プレビューから承認する）
    const deliveredDir = f.type === "medical" ? "private_assets" : "public/assets";
    const delivered = f.delivered && existsSync(`${process.cwd()}/${deliveredDir}/${f.type}/${f.delivered.filename}`) ? f.delivered : null;
    await db
      .insert(figureAssets)
      .values({
        assetId: f.assetId,
        type: f.type,
        altText: f.altText,
        longDescription: f.longDescription,
        learningObjective: f.learningObjective,
        sourceRefs: f.sourceRefs ?? [{ sourceId: "internal-draft-stage", section: "病期とは（架空の院内原稿）", quote: "病期は、しこりの大きさ、近くのリンパ節への広がり、離れた臓器への広がりを基本に判断します。" }],
        filename: delivered?.filename ?? null,
        width: delivered?.width ?? null,
        height: delivered?.height ?? null,
        reviewStatus: delivered && f.type === "editorial" ? "approved" : "pending_review",
        copyrightStatus: "internal_ai_generated",
        generatorNote: delivered ? (f.type === "medical" ? "ChatGPT 画像生成（2026-11-03 納品、1200px 原画を 900px に縮小）。監修前のため private_assets に保管" : "ChatGPT 画像生成。原画は docs/design/handoff_visual_v1/assets/") : "ChatGPT で制作予定（VISUAL_ASSET_SPECS_5.md）。未納品",
      })
      .onConflictDoNothing();
    for (const [order, pl] of f.placements.entries()) {
      void order;
      const materialId = materialIdByTitle.get(pl.materialTitle);
      if (!materialId) continue;
      const [mat] = await db.select({ versionId: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, materialId)).limit(1);
      if (!mat?.versionId) continue;
      const [exists] = await db.select({ id: figurePlacements.id }).from(figurePlacements).where(eq(figurePlacements.assetId, f.assetId)).limit(1);
      if (exists) continue;
      await db.insert(figurePlacements).values({ assetId: f.assetId, materialVersionId: mat.versionId, slideSeq: pl.slideSeq, labels: pl.labels, caption: pl.caption, sourceNote: "院内原稿（架空）", displayOrder: SEED_FIGURES.indexOf(f) });
    }
  }

  // 監修記録の再適用（docs/design/reviews/figure_reviews.json）。既存の承認フロー reviewFigure（承認者権限・監査ログ）を通す
  if (process.env.SEED_FIGURE_REVIEWS !== "0") {
    const { readFileSync, existsSync: ex } = await import("node:fs");
    const file = `${process.cwd()}/docs/design/reviews/figure_reviews.json`;
    if (ex(file)) {
      const { reviewFigure } = await import("@/server/services/figures");
      const { reviews } = JSON.parse(readFileSync(file, "utf8")) as {
        reviews: { assetId: string; status: "approved" | "rejected" | "pending_review"; approverEmail: string; reviewedBy: string; reviewedAt: string; note: string; scopeNote: string; revisionCandidates: string[] }[];
      };
      for (const r of reviews) {
        const [a] = await db.select({ status: figureAssets.reviewStatus, filename: figureAssets.filename }).from(figureAssets).where(eq(figureAssets.assetId, r.assetId)).limit(1);
        if (!a || !a.filename || a.status === r.status) continue;
        const approverId = userIdByEmail.get(r.approverEmail);
        if (!approverId) continue;
        await reviewFigure({ userId: approverId, kind: "staff", name: r.reviewedBy, email: r.approverEmail }, r.assetId, r.status, `${r.note}（監修者: ${r.reviewedBy}）`, db, {
          scopeNote: r.scopeNote,
          revisionCandidates: r.revisionCandidates,
          reviewedAt: new Date(r.reviewedAt),
        });
      }
    }
  }

  // 処方テンプレート
  for (const t of SEED_TEMPLATES) {
    const [existing] = await db.select({ id: prescriptionTemplates.id }).from(prescriptionTemplates).where(eq(prescriptionTemplates.name, t.name)).limit(1);
    if (existing) continue;
    const ids = t.titles.map((title) => materialIdByTitle.get(title)).filter((x): x is string => !!x);
    await db.insert(prescriptionTemplates).values({
      scope: t.scope,
      ownerOrgId: t.ownerOrgSlug ? orgIdBySlug.get(t.ownerOrgSlug)! : null,
      name: t.name,
      description: t.description,
      materialIds: ids,
    });
  }

  // 患者A の自然な診察履歴（初回診察 14 日前）。テスト用の患者B には入れない
  if (process.env.SEED_DEMO_HISTORY !== "0") {
    await seedDemoHistory(db, {
      patientId: userIdByEmail.get("patient1@example.com")!,
      clinicianId: userIdByEmail.get("dr.yamada@example.com")!,
      orgId: orgIdBySlug.get("sakura-general")!,
      materialIdByTitle,
    });
    // 患者A の架空の体調記録・診察ノート（外来間サマリーのデモ用。Step 4）
    await seedDemoHealth(db, userIdByEmail.get("patient1@example.com")!);
    // 撮影用デモ環境: 記録済みの Claude の外来間要約を生成したときの記録（11 月 3 日のしびれ 1/4）にそろえる
    if (replayFile("INTERVISIT_REPLAY_FILE")) await applyReplayEdit(db, userIdByEmail.get("patient1@example.com")!);
  }

  return { orgs: orgIdBySlug, users: userIdByEmail, materials: materialIdByTitle };
}

if (process.argv[1]?.endsWith("seed.ts")) {
  (async () => {
    await ensureMigrated();
    const r = await seed();
    console.log(`seeded: ${r.orgs.size} orgs, ${r.users.size} users`);
    process.exit(0);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
