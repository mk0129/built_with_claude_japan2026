import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { consultationSessions, qrGrants } from "@/server/db/schema";
import { AppError } from "@/server/authz/errors";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { approveGrant, claimGrant, createGrant, denyGrant, getGrantForPatient } from "@/server/services/qr";
import { decideExtension, endConsultation, getPatientSummary, requestExtension } from "@/server/services/consultation";
import { DR_KOBAYASHI, DR_YAMADA, OP_EDITOR, PATIENT_A, PATIENT_B, loginHeaders, setupDb, type Seeded } from "../helpers";

let seeded: Seeded;
const uid = (email: string) => seeded.users.get(email)!;
const org = (slug: string) => seeded.orgs.get(slug)!;

async function expectAppError(p: Promise<unknown>, status: number, code?: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).status).toBe(status);
    if (code) expect((e as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected AppError ${status}${code ? ` ${code}` : ""}`);
}

/** 患者が QR を出し、医療者が読み取り、患者が承認するまで */
async function startSession(patientEmail = PATIENT_A, staffEmail = DR_YAMADA, orgSlug = "sakura-general") {
  const g = await createGrant(uid(patientEmail));
  await claimGrant({ token: g.token, staffUserId: uid(staffEmail), orgId: org(orgSlug) });
  const { consultationSessionId } = await approveGrant(g.grantId, uid(patientEmail));
  return { grant: g, sessionId: consultationSessionId };
}

beforeAll(async () => {
  seeded = await setupDb();
});

describe("QR グラント", () => {
  it("生トークンは保存されず、ハッシュだけが残る（AUTH-03）", async () => {
    const g = await createGrant(uid(PATIENT_A));
    const [row] = await getDb().select().from(qrGrants).where(eq(qrGrants.id, g.grantId));
    expect(row.tokenHash).not.toBe(g.token);
    expect(row.tokenHash).toHaveLength(64);
    expect(g.code).toMatch(/^\d{6}$/);
    expect(g.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it("T01: 患者が拒否 → 医療者は患者サマリにアクセスできない（403）", async () => {
    const g = await createGrant(uid(PATIENT_A));
    const c = await claimGrant({ token: g.token, staffUserId: uid(DR_YAMADA), orgId: org("sakura-general") });
    expect(c.grantId).toBe(g.grantId);
    await denyGrant(g.grantId, uid(PATIENT_A));
    const status = await getGrantForPatient(g.grantId, uid(PATIENT_A));
    expect(status.decision).toBe("denied");
    expect(status.consultationSessionId).toBeNull();
    const headers = await loginHeaders(DR_YAMADA);
    // セッションが存在しないので、どの ID でも 403
    await expectAppError(requireActiveConsultation(headers, g.grantId), 403, "NO_ACTIVE_CONSULTATION");
    // 承認済みグラントが無いので approve も不可
    await expectAppError(approveGrant(g.grantId, uid(PATIENT_A)), 409, "GRANT_ALREADY_DECIDED");
  });

  it("T02: 患者が承認 → 医療者は患者サマリを閲覧できる", async () => {
    const { sessionId } = await startSession();
    const headers = await loginHeaders(DR_YAMADA);
    const ctx = await requireActiveConsultation(headers, sessionId);
    expect(ctx.patientId).toBe(uid(PATIENT_A));
    const summary = await getPatientSummary(ctx);
    expect(summary.patient.displayName).toBe("佐藤 花子");
    await endConsultation(sessionId, uid(PATIENT_A));
  });

  it("T03: 使用済み・期限切れの QR は再利用できない", async () => {
    const { grant, sessionId } = await startSession();
    // 使用済み
    await expectAppError(claimGrant({ token: grant.token, staffUserId: uid(DR_KOBAYASHI), orgId: org("hidamari-medical") }), 404, "GRANT_INVALID_OR_USED");
    await endConsultation(sessionId, uid(PATIENT_A));
    // 期限切れ
    const g2 = await createGrant(uid(PATIENT_A));
    await getDb().update(qrGrants).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(qrGrants.id, g2.grantId));
    await expectAppError(claimGrant({ token: g2.token, staffUserId: uid(DR_YAMADA), orgId: org("sakura-general") }), 404, "GRANT_INVALID_OR_USED");
    expect((await getGrantForPatient(g2.grantId, uid(PATIENT_A))).decision).toBe("expired");
  });

  it("AUTH-09: 複数端末が同時に読んでも要求者は 1 人に限定される", async () => {
    const g = await createGrant(uid(PATIENT_A));
    const results = await Promise.allSettled([
      claimGrant({ token: g.token, staffUserId: uid(DR_YAMADA), orgId: org("sakura-general") }),
      claimGrant({ token: g.token, staffUserId: uid(DR_KOBAYASHI), orgId: org("hidamari-medical") }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    const status = await getGrantForPatient(g.grantId, uid(PATIENT_A));
    expect(status.claimed).not.toBeNull();
    await denyGrant(g.grantId, uid(PATIENT_A));
  });

  it("6 桁コードでも読み取れる（P08）", async () => {
    const g = await createGrant(uid(PATIENT_A));
    const c = await claimGrant({ code: g.code, staffUserId: uid(DR_YAMADA), orgId: org("sakura-general") });
    expect(c.grantId).toBe(g.grantId);
    await denyGrant(g.grantId, uid(PATIENT_A));
  });

  it("組織に所属しない / clinician 役割がない医療者は読み取れない", async () => {
    const g = await createGrant(uid(PATIENT_A));
    await expectAppError(claimGrant({ token: g.token, staffUserId: uid(DR_KOBAYASHI), orgId: org("sakura-general") }), 403, "NOT_ORG_MEMBER");
    await expectAppError(claimGrant({ token: g.token, staffUserId: uid(OP_EDITOR), orgId: org("shiori-operator") }), 403, "ROLE_REQUIRED");
    await denyGrant(g.grantId, uid(PATIENT_A));
  });

  it("他人のグラントは見られない・承認できない", async () => {
    const g = await createGrant(uid(PATIENT_A));
    await expectAppError(getGrantForPatient(g.grantId, uid(PATIENT_B)), 404);
    await expectAppError(approveGrant(g.grantId, uid(PATIENT_B)), 404);
    await denyGrant(g.grantId, uid(PATIENT_A));
  });

  it("読み取り前の承認は拒否される（医療者が確定していない）", async () => {
    const g = await createGrant(uid(PATIENT_A));
    await expectAppError(approveGrant(g.grantId, uid(PATIENT_A)), 409, "GRANT_NOT_CLAIMED");
    await denyGrant(g.grantId, uid(PATIENT_A));
  });
});

describe("診察セッション", () => {
  it("T04: 60 分経過 → 医療者の閲覧は拒否される", async () => {
    const { sessionId } = await startSession();
    const headers = await loginHeaders(DR_YAMADA);
    await requireActiveConsultation(headers, sessionId);
    await getDb().update(consultationSessions).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(consultationSessions.id, sessionId));
    await expectAppError(requireActiveConsultation(headers, sessionId), 403, "NO_ACTIVE_CONSULTATION");
  });

  it("T04: 患者が共有停止 → 医療者の閲覧は拒否される", async () => {
    const { sessionId } = await startSession();
    const headers = await loginHeaders(DR_YAMADA);
    await requireActiveConsultation(headers, sessionId);
    await endConsultation(sessionId, uid(PATIENT_A));
    await expectAppError(requireActiveConsultation(headers, sessionId), 403, "NO_ACTIVE_CONSULTATION");
  });

  it("医療者も即時終了でき、第三者は終了できない", async () => {
    const { sessionId } = await startSession();
    await expectAppError(endConsultation(sessionId, uid(DR_KOBAYASHI)), 403, "NOT_PARTY");
    await expectAppError(endConsultation(sessionId, uid(PATIENT_B)), 403, "NOT_PARTY");
    const r = await endConsultation(sessionId, uid(DR_YAMADA));
    expect(r.alreadyEnded).toBe(false);
  });

  it("他院の医療者は、承認した医療者のセッションを使えない", async () => {
    const { sessionId } = await startSession();
    const other = await loginHeaders(DR_KOBAYASHI);
    await expectAppError(requireActiveConsultation(other, sessionId), 403, "NO_ACTIVE_CONSULTATION");
    await endConsultation(sessionId, uid(PATIENT_A));
  });

  it("延長は患者の再承認後にのみ期限が伸びる（D05）", async () => {
    const { sessionId } = await startSession();
    const headers = await loginHeaders(DR_YAMADA);
    const ctx = await requireActiveConsultation(headers, sessionId);
    const before = ctx.expiresAt.getTime();
    const ext = await requestExtension(ctx);
    expect(ext.duplicate).toBe(false);
    expect((await requestExtension(ctx)).duplicate).toBe(true);
    const [mid] = await getDb().select().from(consultationSessions).where(eq(consultationSessions.id, sessionId));
    expect(mid.expiresAt.getTime()).toBe(before);
    // 患者Bは承認できない
    await expectAppError(decideExtension(sessionId, uid(PATIENT_B), true), 404);
    await decideExtension(sessionId, uid(PATIENT_A), true);
    const [after] = await getDb().select().from(consultationSessions).where(eq(consultationSessions.id, sessionId));
    expect(after.expiresAt.getTime()).toBeGreaterThan(before);
    await endConsultation(sessionId, uid(PATIENT_A));
  });

  it("T22: 別の病院で承認しても履歴は本人のアカウントに残り、両院のセッションが並ぶ", async () => {
    const a = await startSession(PATIENT_A, DR_YAMADA, "sakura-general");
    await endConsultation(a.sessionId, uid(PATIENT_A));
    const b = await startSession(PATIENT_A, DR_KOBAYASHI, "hidamari-medical");
    const headers = await loginHeaders(DR_KOBAYASHI);
    const ctx = await requireActiveConsultation(headers, b.sessionId);
    const summary = await getPatientSummary(ctx);
    expect(summary.patient.id).toBe(uid(PATIENT_A));
    expect(summary.previousConsultations.some((s) => s.orgName.startsWith("さくら"))).toBe(true);
    await endConsultation(b.sessionId, uid(PATIENT_A));
  });
});
