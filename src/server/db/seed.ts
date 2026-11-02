import { eq } from "drizzle-orm";
import { ensureMigrated, getDb, type Db } from "./client";
import { materialVersions, materials, organizationMembers, organizations, user } from "./schema";
import { DEMO_ACCOUNTS, DEMO_MATERIALS, DEMO_ORGS } from "./seed-data";

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
  for (const m of DEMO_MATERIALS) {
    const [existing] = await db.select({ id: materials.id }).from(materials).where(eq(materials.title, m.title)).limit(1);
    if (existing) continue;
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
  }

  return { orgs: orgIdBySlug, users: userIdByEmail };
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
