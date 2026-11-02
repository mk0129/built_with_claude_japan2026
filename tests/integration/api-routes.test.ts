import { beforeAll, describe, expect, it } from "vitest";
import { GET as patientSummary } from "@/app/api/v1/consultations/[id]/patient/route";
import { POST as endRoute } from "@/app/api/v1/consultations/[id]/end/route";
import { POST as createQr } from "@/app/api/v1/qr/route";
import { POST as claimRoute } from "@/app/api/v1/qr/claim/route";
import { POST as approveRoute } from "@/app/api/v1/qr/[id]/approve/route";
import { GET as consultationRoute } from "@/app/api/v1/consultations/[id]/route";
import { DR_KOBAYASHI, DR_YAMADA, PATIENT_A, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

let seeded: Seeded;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, headers: Headers, json?: unknown) =>
  new Request(`http://localhost:3000${url}`, {
    method: json === undefined ? "GET" : "POST",
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });

beforeAll(async () => {
  seeded = await setupDb();
});

describe("HTTP 層: 認証・認可が毎回検証される", () => {
  it("未ログインは 401、患者が医療者APIを叩くと 403", async () => {
    const anon = await patientSummary(new Request("http://localhost:3000/x"), ctx("00000000-0000-0000-0000-000000000000"));
    expect(anon.status).toBe(401);
    const patient = await loginHeaders(PATIENT_A);
    const r = await patientSummary(req("/x", patient), ctx("00000000-0000-0000-0000-000000000000"));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("STAFF_ONLY");
  });

  it("QR 発行 → 読取 → 承認 → 閲覧 200 → 終了 → 閲覧 403（T01/T02/T04 の HTTP 版）", async () => {
    const patient = await loginHeaders(PATIENT_A);
    const staff = await loginHeaders(DR_YAMADA);
    const orgId = seeded.orgs.get("sakura-general")!;

    const issued = await (await createQr(req("/api/v1/qr", patient, {}))).json();
    expect(issued.qrUrl).toContain("/c?t=");

    // 他院の医療者が所属外の組織IDで読もうとすると 403
    const bad = await claimRoute(req("/api/v1/qr/claim", await loginHeaders(DR_KOBAYASHI), { orgId, token: issued.token }));
    expect(bad.status).toBe(403);

    const claimed = await claimRoute(req("/api/v1/qr/claim", staff, { orgId, token: issued.token }));
    expect(claimed.status).toBe(200);

    // 承認前は閲覧不可（セッションが存在しない）
    const beforeApprove = await patientSummary(req("/x", staff), ctx(issued.grantId));
    expect(beforeApprove.status).toBe(403);

    const approved = await (await approveRoute(req("/x", patient, {}), ctx(issued.grantId))).json();
    const sessionId = approved.consultationSessionId as string;

    const ok = await patientSummary(req("/x", staff), ctx(sessionId));
    expect(ok.status).toBe(200);
    expect((await ok.json()).patient.displayName).toBe("佐藤 花子");

    const ended = await endRoute(req("/x", patient, {}), ctx(sessionId));
    expect(ended.status).toBe(200);

    const after = await patientSummary(req("/x", staff), ctx(sessionId));
    expect(after.status).toBe(403);
  });

  it("不正な JSON / バリデーション違反は 400", async () => {
    const staff = await loginHeaders(DR_YAMADA);
    const r = await claimRoute(req("/api/v1/qr/claim", staff, { orgId: "not-a-uuid", code: "12" }));
    expect(r.status).toBe(400);
  });
});

describe("共有の終了（UX-10 回帰）", () => {
  it("患者が終了 → 医療者の閲覧は即時 403。二重送信は 200（終了済み）で返り、状態 API は終了者を返す", async () => {
    const patient = await loginHeaders(PATIENT_A);
    const staff = await loginHeaders(DR_YAMADA);
    const { sessionId } = await startSession(seeded, PATIENT_A, DR_YAMADA, "sakura-general");
    expect((await patientSummary(req("/x", staff), ctx(sessionId))).status).toBe(200);

    const first = await endRoute(req("/x", patient, {}), ctx(sessionId));
    expect(first.status).toBe(200);
    // 共有終了後は、終了直後の同一秒でもサーバー側でアクセスが無効化される
    const denied = await patientSummary(req("/x", staff), ctx(sessionId));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe("NO_ACTIVE_CONSULTATION");
    // 二度押し・通信の再送は失敗にせず、終了済みとして受け付ける（画面が固まらない）
    const second = await endRoute(req("/x", patient, {}), ctx(sessionId));
    expect(second.status).toBe(200);
    expect((await second.json()).alreadyEnded).toBe(true);
    // 患者・医療者どちらから見ても active=false, endedBy=patient
    for (const h of [patient, staff]) {
      const c = await (await consultationRoute(req("/x", h), ctx(sessionId))).json();
      expect(c.active).toBe(false);
      expect(c.endedBy).toBe("patient");
    }
  });

  it("医療者が先に終了した後に患者が終了を押しても 200（終了済み）", async () => {
    const patient = await loginHeaders(PATIENT_A);
    const staff = await loginHeaders(DR_YAMADA);
    const { sessionId } = await startSession(seeded, PATIENT_A, DR_YAMADA, "sakura-general");
    expect((await endRoute(req("/x", staff, {}), ctx(sessionId))).status).toBe(200);
    const r = await endRoute(req("/x", patient, {}), ctx(sessionId));
    expect(r.status).toBe(200);
    expect((await r.json()).alreadyEnded).toBe(true);
    const c = await (await consultationRoute(req("/x", patient), ctx(sessionId))).json();
    expect(c.endedBy).toBe("clinician");
    expect((await patientSummary(req("/x", staff), ctx(sessionId))).status).toBe(403);
  });
});
