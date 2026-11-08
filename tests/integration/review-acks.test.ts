import { beforeAll, describe, expect, it } from "vitest";
import { GET as acksGet, POST as ackPost } from "@/app/api/v1/learn/reviews/route";
import { DELETE as unackRoute } from "@/app/api/v1/learn/reviews/[materialId]/route";
import { PATIENT_A, PATIENT_B, loginHeaders, setupDb, type Seeded } from "../helpers";

/**
 * 学習記録「もう一度確認したいこと」の既読（理解した）。患者本人だけが付け外しでき、他の患者には見えない。
 * 採点・学習の記録には触れない（教材 ID と理解確認の完了日時を控えるだけ）。
 */
let seeded: Seeded;
const mat = (title: string) => seeded.materials.get(title)!;
const req = (headers: Headers, json?: unknown, method?: string) =>
  new Request("http://localhost:3000/x", {
    method: method ?? (json === undefined ? "GET" : "POST"),
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });
const ctx = (materialId: string) => ({ params: Promise.resolve({ materialId }) });

beforeAll(async () => {
  seeded = await setupDb();
});

describe("理解した（復習一覧の既読）", () => {
  it("付ける → 一覧に出る → 付け直すと上書き → 外す。不正な教材 ID は 400。他の患者には見えない", async () => {
    const pb = await loginHeaders(PATIENT_B);
    const id = mat("乳がんの診断と病期の考え方");
    expect((await body(await acksGet(req(pb)))).json.acks).toEqual([]);
    const at = "2026-11-04T01:02:03.000Z";
    const first = await body(await ackPost(req(pb, { materialId: id, completedAt: at })));
    expect(first.status).toBe(200);
    expect(first.json.acks).toHaveLength(1);
    expect(first.json.acks[0]).toMatchObject({ materialId: id, attemptCompletedAt: at });
    const again = await body(await ackPost(req(pb, { materialId: id, completedAt: null })));
    expect(again.json.acks).toHaveLength(1);
    expect(again.json.acks[0].attemptCompletedAt).toBeNull();
    expect((await ackPost(req(pb, { materialId: "nope" }))).status).toBe(400);
    expect((await ackPost(req(pb, { materialId: id, completedAt: "not-a-date" }))).status).toBe(400);
    // 他の患者には見えない
    const pa = await loginHeaders(PATIENT_A);
    expect((await body(await acksGet(req(pa)))).json.acks).toEqual([]);
    // 外す
    const removed = await body(await unackRoute(req(pb, undefined, "DELETE"), ctx(id)));
    expect(removed.json.acks).toEqual([]);
  });
});
