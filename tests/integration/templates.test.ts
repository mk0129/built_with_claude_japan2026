import { beforeAll, describe, expect, it } from "vitest";
import { GET as templatesGet, POST as templatesPost } from "@/app/api/v1/consultations/[id]/templates/route";
import { DELETE as templateDelete } from "@/app/api/v1/consultations/[id]/templates/[templateId]/route";
import { POST as endRoute } from "@/app/api/v1/consultations/[id]/end/route";
import { DR_KOBAYASHI, DR_YAMADA, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

/**
 * 2026-11: 医療者が自分の施設のセット（処方テンプレート）を作れる。有効な一時共有の中の医療者だけ。
 * 教材はその施設から見える公開中のものに限り、他施設からは見えない。情報処方の記録そのものには触れない。
 */
let seeded: Seeded;
const mat = (title: string) => seeded.materials.get(title)!;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (headers: Headers, json?: unknown, method?: string) =>
  new Request("http://localhost:3000/x", {
    method: method ?? (json === undefined ? "GET" : "POST"),
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });

beforeAll(async () => {
  seeded = await setupDb();
});

describe("施設のセットの作成", () => {
  it("選んだ教材からセットを作ると一覧に出る。名前なし・教材なし・見えない教材は 400。他施設には出ない。終了後は 403", async () => {
    const { sessionId: sid } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const h = await loginHeaders(DR_YAMADA);
    const ids = [mat("乳がんの診断と病期の考え方"), mat("こころのケアと相談先")];
    const created = await body(await templatesPost(req(h, { name: " 術前説明 ", materialIds: [...ids, ids[0]] }), ctx(sid)));
    expect(created.status).toBe(200);
    const mine = created.json.templates.find((t: { id: string }) => t.id === created.json.id);
    expect(mine.name).toBe("術前説明");
    expect(mine.scope).toBe("org");
    expect(mine.materials.map((m: { id: string }) => m.id).sort()).toEqual([...ids].sort());
    const listed = await body(await templatesGet(req(h), ctx(sid)));
    expect(listed.json.templates.some((t: { id: string }) => t.id === created.json.id)).toBe(true);

    expect((await templatesPost(req(h, { name: "", materialIds: ids }), ctx(sid))).status).toBe(400);
    expect((await templatesPost(req(h, { name: "x", materialIds: [] }), ctx(sid))).status).toBe(400);
    expect((await templatesPost(req(h, { name: "x", materialIds: ["00000000-0000-4000-8000-000000000000"] }), ctx(sid))).status).toBe(400);

    // 他施設（ひだまり）の医療者には見えない
    const { sessionId: sid2 } = await startSession(seeded, PATIENT_B, DR_KOBAYASHI, "hidamari-medical");
    const other = await body(await templatesGet(req(await loginHeaders(DR_KOBAYASHI)), ctx(sid2)));
    expect(other.json.templates.some((t: { id: string }) => t.id === created.json.id)).toBe(false);

    // 削除: 他施設からは 404、共通セットは 404、自施設のセットは消える
    const ctx2 = (id: string, templateId: string) => ({ params: Promise.resolve({ id, templateId }) });
    expect((await templateDelete(req(await loginHeaders(DR_KOBAYASHI), undefined, "DELETE"), ctx2(sid2, created.json.id))).status).toBe(404);
    const common = listed.json.templates.find((t: { scope: string }) => t.scope === "common");
    expect((await templateDelete(req(h, undefined, "DELETE"), ctx2(sid, common.id))).status).toBe(404);
    const afterDelete = await body(await templateDelete(req(h, undefined, "DELETE"), ctx2(sid, created.json.id)));
    expect(afterDelete.json.templates.some((t: { id: string }) => t.id === created.json.id)).toBe(false);

    // 共有を終えたあとは作れない
    await endRoute(req(h, {}), ctx(sid));
    expect((await templatesPost(req(h, { name: "x", materialIds: ids }), ctx(sid))).status).toBe(403);
  });
});
