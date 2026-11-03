import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createRoute } from "@/app/api/v1/connect/route";
import { GET as statusRoute } from "@/app/api/v1/connect/[id]/route";
import { POST as cancelRoute } from "@/app/api/v1/connect/[id]/cancel/route";
import { POST as previewRoute } from "@/app/api/v1/connect/preview/route";
import { POST as approveRoute } from "@/app/api/v1/connect/approve/route";
import { POST as denyRoute } from "@/app/api/v1/connect/deny/route";
import { GET as patientSummary } from "@/app/api/v1/consultations/[id]/patient/route";
import { GET as consultationRoute } from "@/app/api/v1/consultations/[id]/route";
import { POST as endRoute } from "@/app/api/v1/consultations/[id]/end/route";
import { POST as extendRoute } from "@/app/api/v1/consultations/[id]/extend/route";
import { POST as decideRoute } from "@/app/api/v1/consultations/[id]/extend/decide/route";
import { POST as createQr } from "@/app/api/v1/qr/route";
import { POST as claimRoute } from "@/app/api/v1/qr/claim/route";
import { POST as approveGrantRoute } from "@/app/api/v1/qr/[id]/approve/route";
import { getDb } from "@/server/db/client";
import { connectRequests, consultationSessions, qrGrants } from "@/server/db/schema";
import { DR_KOBAYASHI, DR_YAMADA, OP_EDITOR, PATIENT_A, PATIENT_B, loginHeaders, setupDb, type Seeded } from "../helpers";

/**
 * 医療者発行 QR（Concept D）の一時共有。承認前アクセス禁止・60 分・即時終了・延長の再承認・終了後の拒否・
 * トークンの使い捨て・他の医療者からの不可視・既存の 6 桁コード（患者発行）の維持を HTTP 層で確認する。
 */
let seeded: Seeded;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (headers: Headers, json?: unknown) =>
  new Request("http://localhost:3000/x", {
    method: json === undefined ? "GET" : "POST",
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });

beforeAll(async () => {
  seeded = await setupDb();
});

async function issue(staff: Headers) {
  const r = await body(await createRoute(req(staff, {})));
  expect(r.status).toBe(200);
  return r.json as { requestId: string; token: string; qrUrl: string; expiresAt: string };
}

describe("医療者発行 QR の一時共有", () => {
  it("発行 → 患者が申請者を確認 → 承認 → 通常の医療者 API で閲覧 → 患者が終了 → 拒否", async () => {
    const staff = await loginHeaders(DR_YAMADA);
    const patient = await loginHeaders(PATIENT_A);
    const r = await issue(staff);
    expect(r.qrUrl).toContain("/home?view=share&connect=");

    // 承認前: 状態に患者情報なし、セッションなし
    const before = await body(await statusRoute(req(staff), ctx(r.requestId)));
    expect(before.json).toMatchObject({ decision: "pending", consultationSessionId: null });
    expect(JSON.stringify(before.json)).not.toContain("佐藤");
    // DB にも患者は記録されていない
    const [row] = await getDb().select().from(connectRequests).where(eq(connectRequests.id, r.requestId));
    expect(row.patientId).toBeNull();
    expect(row.tokenHash).not.toBe(r.token);

    const pv = await body(await previewRoute(req(patient, { token: r.token })));
    expect(pv.json.decision).toBe("pending");
    expect(pv.json.orgName).toContain("さくら総合病院");
    expect(pv.json.clinicianName).toContain("山田");

    const ap = await body(await approveRoute(req(patient, { token: r.token })));
    expect(ap.status).toBe(200);
    const sid = ap.json.consultationSessionId as string;

    const after = await body(await statusRoute(req(staff), ctx(r.requestId)));
    expect(after.json).toMatchObject({ decision: "approved", consultationSessionId: sid });
    const view = await body(await consultationRoute(req(staff), ctx(sid)));
    expect(view.json).toMatchObject({ active: true, patientName: "佐藤 花子" });
    // 60 分
    const [s] = await getDb().select().from(consultationSessions).where(eq(consultationSessions.id, sid));
    expect(s.expiresAt.getTime() - s.startedAt.getTime()).toBe(60 * 60 * 1000);
    // 既存の制約どおり、承認済み qr_grants と相互参照
    const [g] = await getDb().select().from(qrGrants).where(eq(qrGrants.id, s.qrGrantId));
    expect(g).toMatchObject({ decision: "approved", claimedByUserId: s.clinicianId, consultationSessionId: sid });

    expect((await patientSummary(req(staff), ctx(sid))).status).toBe(200);
    // 他の医療者はセッションも申請も見られない
    const other = await loginHeaders(DR_KOBAYASHI);
    expect((await patientSummary(req(other), ctx(sid))).status).toBe(403);
    expect((await statusRoute(req(other), ctx(r.requestId))).status).toBe(404);

    // 患者が即時終了 → 医療者 API は拒否、患者名も返さない
    expect((await endRoute(req(patient, {}), ctx(sid))).status).toBe(200);
    expect((await patientSummary(req(staff), ctx(sid))).status).toBe(403);
    const ended = await body(await consultationRoute(req(staff), ctx(sid)));
    expect(ended.json).toMatchObject({ active: false, endedBy: "patient", patientName: null });
  });

  it("トークンは使い捨て。別の患者・再承認・取り消し後・期限切れは承認できない", async () => {
    const staff = await loginHeaders(DR_YAMADA);
    const a = await loginHeaders(PATIENT_A);
    const b = await loginHeaders(PATIENT_B);

    const r1 = await issue(staff);
    expect((await approveRoute(req(a, { token: r1.token }))).status).toBe(200);
    const again = await body(await approveRoute(req(b, { token: r1.token })));
    expect(again).toMatchObject({ status: 409, json: { error: "REQUEST_ALREADY_DECIDED" } });

    // 新しく発行すると古い申請は取り消し
    const r2 = await issue(staff);
    const r3 = await issue(staff);
    expect((await body(await approveRoute(req(a, { token: r2.token })))).json.error).toBe("REQUEST_ALREADY_DECIDED");
    // 医療者が取り消し
    expect((await body(await cancelRoute(req(staff, {}), ctx(r3.requestId)))).json.cancelled).toBe(true);
    expect((await approveRoute(req(a, { token: r3.token }))).status).toBe(409);

    // 期限切れ
    const r4 = await issue(staff);
    await getDb().update(connectRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(connectRequests.id, r4.requestId));
    expect((await body(await approveRoute(req(a, { token: r4.token })))).json.error).toBe("REQUEST_EXPIRED");
    expect((await body(await statusRoute(req(staff), ctx(r4.requestId)))).json.decision).toBe("expired");

    // 断る
    const r5 = await issue(staff);
    expect((await denyRoute(req(a, { token: r5.token }))).status).toBe(200);
    expect((await body(await statusRoute(req(staff), ctx(r5.requestId)))).json).toMatchObject({ decision: "denied", consultationSessionId: null });

    // 存在しないトークン
    expect((await previewRoute(req(a, { token: "x".repeat(43) }))).status).toBe(404);
  });

  it("役割: 患者は発行できない、診療権限のない職員は発行できない、医療者は承認できない", async () => {
    expect((await createRoute(req(await loginHeaders(PATIENT_A), {}))).status).toBe(403);
    expect((await createRoute(req(await loginHeaders(OP_EDITOR), {}))).status).toBe(403);
    const staff = await loginHeaders(DR_YAMADA);
    const r = await issue(staff);
    expect((await approveRoute(req(staff, { token: r.token }))).status).toBe(403);
    // 所属外の組織を指定しても発行できない
    const hidamari = seeded.orgs.get("hidamari-medical")!;
    expect((await createRoute(req(staff, { orgId: hidamari }))).status).toBe(403);
  });

  it("延長は患者の再承認まで変わらず、承認で 60 分に延長", async () => {
    const staff = await loginHeaders(DR_YAMADA);
    const patient = await loginHeaders(PATIENT_B);
    const r = await issue(staff);
    const sid = (await body(await approveRoute(req(patient, { token: r.token })))).json.consultationSessionId as string;
    await getDb().update(consultationSessions).set({ expiresAt: new Date(Date.now() + 5 * 60 * 1000) }).where(eq(consultationSessions.id, sid));

    expect((await extendRoute(req(staff, {}), ctx(sid))).status).toBe(200);
    const pending = await body(await consultationRoute(req(patient), ctx(sid)));
    expect(pending.json.pendingExtension).not.toBeNull();
    expect(pending.json.remainingSec).toBeLessThanOrEqual(300);
    // 医療者は自分で承認できない
    expect((await decideRoute(req(staff, { approve: true }), ctx(sid))).status).toBe(403);
    expect((await decideRoute(req(patient, { approve: true }), ctx(sid))).status).toBe(200);
    const extended = await body(await consultationRoute(req(patient), ctx(sid)));
    expect(extended.json.remainingSec).toBeGreaterThan(59 * 60);
    expect(extended.json.pendingExtension).toBeNull();
    await endRoute(req(staff, {}), ctx(sid));
  });

  it("既存の 6 桁コード（患者発行 → 医療者が入力 → 患者が承認）も使える", async () => {
    const patient = await loginHeaders(PATIENT_A);
    const staff = await loginHeaders(DR_YAMADA);
    const orgId = seeded.orgs.get("sakura-general")!;
    const g = (await body(await createQr(req(patient, {})))).json;
    expect(g.code).toMatch(/^\d{6}$/);
    expect((await claimRoute(req(staff, { orgId, code: g.code }))).status).toBe(200);
    const ap = await body(await approveGrantRoute(req(patient, {}), ctx(g.grantId)));
    expect(ap.status).toBe(200);
    expect((await patientSummary(req(staff), ctx(ap.json.consultationSessionId))).status).toBe(200);
    await endRoute(req(patient, {}), ctx(ap.json.consultationSessionId));
  });
});
