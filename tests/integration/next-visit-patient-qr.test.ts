import { beforeAll, describe, expect, it } from "vitest";
import { GET as getVisit, PUT as putVisit } from "@/app/api/v1/next-visit/route";
import { POST as issueQr } from "@/app/api/v1/qr/route";
import { POST as claimRoute } from "@/app/api/v1/qr/claim/route";
import { GET as claimStatus } from "@/app/api/v1/qr/claim/[id]/route";
import { POST as approveRoute } from "@/app/api/v1/qr/[id]/approve/route";
import { validVisitDate } from "@/server/services/nextVisit";
import { DR_YAMADA, PATIENT_A, PATIENT_B, loginHeaders, setupDb, type Seeded } from "../helpers";

/**
 * 患者ホームの次回診察日（患者本人が登録した日付だけ）と、患者の QR・6 桁コード（1 回の発行で同じグラント）。
 */
let seeded: Seeded;
const req = (headers: Headers, json?: unknown, method?: string) =>
  new Request("http://localhost:3000/x", {
    method: method ?? (json === undefined ? "GET" : "POST"),
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const tokyo = (offsetDays: number) => new Date(Date.now() + offsetDays * 864e5).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

beforeAll(async () => {
  seeded = await setupDb();
});

describe("次回の診察日", () => {
  it("未登録は null（架空の日付を返さない）。登録・変更・削除は本人だけで、他の患者には見えない", async () => {
    const pa = await loginHeaders(PATIENT_A);
    const pb = await loginHeaders(PATIENT_B);
    expect((await body(await getVisit(req(pa)))).json.visit).toBeNull();
    const d1 = tokyo(14);
    const put = await body(await putVisit(req(pa, { date: d1 }, "PUT")));
    expect(put.status).toBe(200);
    expect(put.json.visit.date).toBe(d1);
    // 再読み込みでも残る・上書きで 1 件のまま
    const d2 = tokyo(21);
    await putVisit(req(pa, { date: d2 }, "PUT"));
    expect((await body(await getVisit(req(pa)))).json.visit.date).toBe(d2);
    expect((await body(await getVisit(req(pb)))).json.visit).toBeNull();
    await putVisit(req(pa, { date: null }, "PUT"));
    expect((await body(await getVisit(req(pa)))).json.visit).toBeNull();
  });

  it("日付の形式・範囲を検証し、医療者は使えない", async () => {
    const pa = await loginHeaders(PATIENT_A);
    for (const bad of ["2026-13-01", "2026-02-30", "11/20", tokyo(800), tokyo(-400)]) {
      expect((await putVisit(req(pa, { date: bad }, "PUT"))).status).toBe(400);
    }
    expect(validVisitDate(tokyo(0))).toBe(true);
    expect(validVisitDate(tokyo(-1))).toBe(true);
    const staff = await loginHeaders(DR_YAMADA);
    expect((await getVisit(req(staff))).status).toBe(403);
    expect((await putVisit(req(staff, { date: tokyo(3) }, "PUT"))).status).toBe(403);
  });
});

describe("患者の QR と 6 桁コード", () => {
  it("1 回の発行で QR の URL と 6 桁コードを返し、どちらで読み取っても同じグラント。読み取り後も患者の承認まで共有されない", async () => {
    const pa = await loginHeaders(PATIENT_A);
    const staff = await loginHeaders(DR_YAMADA);
    const orgId = seeded.orgs.get("sakura-general")!;
    const g = (await body(await issueQr(req(pa, {})))).json;
    expect(g.qrUrl).toMatch(/\/c\?t=[A-Za-z0-9_-]{20,}$/);
    expect(g.code).toMatch(/^\d{6}$/);
    const token = new URL(g.qrUrl).searchParams.get("t");
    const claimed = await body(await claimRoute(req(staff, { orgId, token })));
    expect(claimed.status).toBe(200);
    expect(claimed.json.grantId).toBe(g.grantId);
    // 同じグラントの 6 桁コードは、QR で読み取られた後は使えない（1 回限り）
    expect((await claimRoute(req(staff, { orgId, code: g.code }))).status).toBe(404);
    // 承認前: 医療者に共有は始まらない
    const before = (await body(await claimStatus(req(staff), ctx(g.grantId)))).json;
    expect(before.decision).toBe("pending");
    expect(before.consultationSessionId ?? null).toBeNull();
    const ok = await body(await approveRoute(req(pa, {}), ctx(g.grantId)));
    expect(ok.status).toBe(200);
    const after = (await body(await claimStatus(req(staff), ctx(g.grantId)))).json;
    expect(after.decision).toBe("approved");
    expect(after.consultationSessionId).toBeTruthy();
  });
});
