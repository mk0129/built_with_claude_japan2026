import { beforeAll, describe, expect, it } from "vitest";
import { GET as treatmentGet, PUT as treatmentPut } from "@/app/api/v1/treatment/route";
import { POST as eventPost } from "@/app/api/v1/treatment/events/route";
import { DELETE as eventDelete } from "@/app/api/v1/treatment/events/[eventId]/route";
import { GET as clinicianGet } from "@/app/api/v1/consultations/[id]/treatment/route";
import { POST as endRoute } from "@/app/api/v1/consultations/[id]/end/route";
import { DR_YAMADA, PATIENT_A, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

/**
 * 治療の記録: 患者本人だけが登録・削除でき、他の患者の記録は消せない。医療者は有効な一時共有の間だけ読める。
 * 日付は今日の 2 年前〜1 年後。がん種・治療の種類・日付以外は推定しない。
 */
let seeded: Seeded;
const req = (headers: Headers, json?: unknown, method?: string) =>
  new Request("http://localhost:3000/x", {
    method: method ?? (json === undefined ? "GET" : "POST"),
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });
const ctx = <K extends string>(key: K, id: string) => ({ params: Promise.resolve({ [key]: id } as Record<K, string>) });
const dayAgo = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

beforeAll(async () => {
  seeded = await setupDb();
});

describe("治療の記録", () => {
  it("未登録は空。がん種・治療を登録し、外来の日の出来事を足すと一覧に出る。不正な日付・種類は 400", async () => {
    const pb = await loginHeaders(PATIENT_B);
    const empty = await body(await treatmentGet(req(pb)));
    expect(empty.json.profile.modality).toBe("none");
    expect(empty.json.events).toEqual([]);
    expect(empty.json.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const saved = await body(await treatmentPut(req(pb, { cancerType: "乳がん", modality: "infusion", treatmentName: " 術後の化学療法 ", startDate: dayAgo(21), cycleDays: 21 }, "PUT")));
    expect(saved.status).toBe(200);
    expect(saved.json.profile).toMatchObject({ cancerType: "乳がん", modality: "infusion", treatmentName: "術後の化学療法", cycleDays: 21 });
    expect((await treatmentPut(req(pb, { modality: "magic" }, "PUT"))).status).toBe(400);
    expect((await treatmentPut(req(pb, { modality: "oral", startDate: "2020-01-01" }, "PUT"))).status).toBe(400);

    const added = await body(await eventPost(req(pb, { date: dayAgo(21), kind: "infusion", courseNo: 2 })));
    expect(added.status).toBe(200);
    expect(added.json.events).toHaveLength(1);
    expect(added.json.events[0]).toMatchObject({ date: dayAgo(21), kind: "infusion", courseNo: 2 });
    const visitOnly = await body(await eventPost(req(pb, { date: dayAgo(7), kind: "visit_only" })));
    expect(visitOnly.json.events.map((e: { kind: string }) => e.kind)).toEqual(["visit_only", "infusion"]);
    expect((await eventPost(req(pb, { date: "2026-13-40", kind: "infusion" }))).status).toBe(400);
    expect((await eventPost(req(pb, { date: dayAgo(1), kind: "party" }))).status).toBe(400);

    // 他の患者は消せない（404）。本人は消せる
    const pa = await loginHeaders(PATIENT_A);
    const id = added.json.events[0].id as string;
    expect((await eventDelete(req(pa, undefined, "DELETE"), ctx("eventId", id))).status).toBe(404);
    const afterDelete = await body(await eventDelete(req(pb, undefined, "DELETE"), ctx("eventId", id)));
    expect(afterDelete.json.events).toHaveLength(1);
    // 他の患者の一覧には出ない
    expect((await body(await treatmentGet(req(pa)))).json.events).toEqual([]);
  });

  it("医療者は有効な一時共有の間だけ読める（終了後は 403）。内容は患者の登録のまま", async () => {
    const pb = await loginHeaders(PATIENT_B);
    await treatmentPut(req(pb, { cancerType: "乳がん", modality: "infusion", startDate: dayAgo(21) }, "PUT"));
    const { sessionId: sid } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const h = await loginHeaders(DR_YAMADA);
    const seen = await body(await clinicianGet(req(h), ctx("id", sid)));
    expect(seen.status).toBe(200);
    expect(seen.json.profile).toMatchObject({ cancerType: "乳がん", modality: "infusion" });
    await endRoute(req(h, {}), ctx("id", sid));
    expect((await clinicianGet(req(h), ctx("id", sid))).status).toBe(403);
  });
});
