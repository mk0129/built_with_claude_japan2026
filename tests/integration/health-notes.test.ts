import { beforeAll, describe, expect, it } from "vitest";
import { GET as listRecords, POST as createRecord } from "@/app/api/v1/health/records/route";
import { DELETE as deleteRecord, PATCH as updateRecord } from "@/app/api/v1/health/records/[id]/route";
import { GET as getSymptoms, PUT as putSymptoms } from "@/app/api/v1/health/symptoms/route";
import { GET as listNotes, POST as createNote } from "@/app/api/v1/notes/route";
import { DELETE as deleteNote, PATCH as updateNote } from "@/app/api/v1/notes/[id]/route";
import { GET as clinicianHealth } from "@/app/api/v1/consultations/[id]/health/route";
import { GET as patientSummary } from "@/app/api/v1/consultations/[id]/patient/route";
import { POST as endRoute } from "@/app/api/v1/consultations/[id]/end/route";
import { POST as startAttempt } from "@/app/api/v1/learn/[versionId]/attempts/route";
import { POST as answerRoute } from "@/app/api/v1/attempts/[attemptId]/answers/route";
import { GET as libraryRoute } from "@/app/api/v1/library/route";
import { DR_KOBAYASHI, DR_YAMADA, PATIENT_A, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

/**
 * Phase 2 Step 3: 体調記録・症状の設定・診察ノート。本人だけが作成・編集・削除でき、他の患者の記録は見えず変えられない。
 * 医療者は有効な一時共有の間だけ質問と体調記録を読める。欠測（未回答・未測定）と「症状なし（0）」を区別する。
 */
let seeded: Seeded;
const ctx = <K extends string>(key: K, id: string) => ({ params: Promise.resolve({ [key]: id } as Record<K, string>) });
const req = (headers: Headers, json?: unknown, method?: string) =>
  new Request("http://localhost:3000/x", {
    method: method ?? (json === undefined ? "GET" : "POST"),
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });
const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

beforeAll(async () => {
  seeded = await setupDb();
});

describe("体調記録（Step 3）", () => {
  it("バイタルは任意で未測定は null。同じ日に複数回。欠測と 0 を区別。編集・削除は本人だけ", async () => {
    const pb = await loginHeaders(PATIENT_B);
    const pa = await loginHeaders(PATIENT_A);
    const first = await body(
      await createRecord(req(pb, { measuredAt: at(3), vitals: { temperature: 36.8, pulse: 72 }, symptoms: [{ key: "fatigue", severity: 0 }, { key: "nausea", severity: 2, interference: "食事が半分" }] })),
    );
    expect(first.status).toBe(200);
    expect(first.json.record.vitals).toEqual({ temperature: 36.8, systolic: null, diastolic: null, pulse: 72, spo2: null });
    // 同じ日の 2 回目（前回の値は引き継がない）
    const second = await body(await createRecord(req(pb, { measuredAt: at(1), vitals: { systolic: 118, diastolic: 74 }, symptoms: [] })));
    expect(second.json.record.vitals).toEqual({ temperature: null, systolic: 118, diastolic: 74, pulse: null, spo2: null });
    expect(second.json.record.symptoms).toEqual([]);
    const list = (await body(await listRecords(req(pb)))).json.records;
    expect(list).toHaveLength(2);
    const r1 = list.find((r: { id: string }) => r.id === first.json.record.id);
    // 0（なし）は保存、回答しなかった症状（numbness など）は行がない = 欠測
    expect(r1.symptoms.map((s: { key: string; severity: number }) => [s.key, s.severity])).toEqual([["fatigue", 0], ["nausea", 2]]);
    expect(r1.symptoms.find((s: { key: string }) => s.key === "numbness")).toBeUndefined();
    expect(new Date(r1.createdAt).getTime()).toBeGreaterThan(new Date(r1.measuredAt).getTime());

    // 範囲外・未来・不正な程度は拒否
    expect((await createRecord(req(pb, { measuredAt: at(1), vitals: { temperature: 50 }, symptoms: [] }))).status).toBe(400);
    expect((await createRecord(req(pb, { measuredAt: new Date(Date.now() + 86400_000).toISOString(), vitals: {}, symptoms: [] }))).status).toBe(400);
    expect((await createRecord(req(pb, { measuredAt: at(1), vitals: {}, symptoms: [{ key: "fatigue", severity: 5 }] }))).status).toBe(400);
    expect((await createRecord(req(pb, { measuredAt: at(1), vitals: {}, symptoms: [{ key: "unknown-x", severity: 1 }] }))).status).toBe(400);

    // 他の患者からは見えず、編集・削除できない
    expect((await body(await listRecords(req(pa)))).json.records.some((r: { id: string }) => r.id === first.json.record.id)).toBe(false);
    expect((await updateRecord(req(pa, { measuredAt: at(3), vitals: {}, symptoms: [] }, "PATCH"), ctx("id", first.json.record.id))).status).toBe(404);
    expect((await deleteRecord(req(pa, undefined, "DELETE"), ctx("id", first.json.record.id))).status).toBe(404);
    // 医療者・未ログインは患者の API を使えない
    expect((await listRecords(req(await loginHeaders(DR_YAMADA)))).status).toBe(403);
    expect((await listRecords(req(new Headers()))).status).toBe(401);

    // 本人は編集（更新日時が変わる）・削除できる
    const edited = await body(await updateRecord(req(pb, { measuredAt: at(3), vitals: { temperature: 37.1 }, symptoms: [{ key: "fatigue", severity: 1 }] }, "PATCH"), ctx("id", first.json.record.id)));
    expect(edited.json.record.vitals.temperature).toBe(37.1);
    expect(edited.json.record.vitals.pulse).toBeNull();
    expect(new Date(edited.json.record.updatedAt).getTime()).toBeGreaterThan(new Date(edited.json.record.createdAt).getTime());
    expect((await deleteRecord(req(pb, undefined, "DELETE"), ctx("id", second.json.record.id))).status).toBe(200);
    expect((await body(await listRecords(req(pb)))).json.records).toHaveLength(1);
  });

  it("症状の追加・非表示・並び替え・独自の症状名は保存され、非表示にしても過去の記録は残る", async () => {
    const pa = await loginHeaders(PATIENT_A);
    const def = (await body(await getSymptoms(req(pa)))).json.settings;
    expect(def.active).toEqual(["fatigue", "nausea", "numbness", "jointPain", "hotFlash"]);
    await createRecord(req(pa, { measuredAt: at(2), vitals: {}, symptoms: [{ key: "hotFlash", severity: 3 }] }));
    const custom = "custom-test-0001";
    const saved = await body(
      await putSymptoms(req(pa, { active: ["numbness", "fatigue", "nausea", "jointPain", "rash", custom], customNames: { [custom]: "足の裏のぴりぴり" } }, "PUT")),
    );
    expect(saved.json.settings).toEqual({ active: ["numbness", "fatigue", "nausea", "jointPain", "rash", custom], hidden: ["hotFlash"], customNames: { [custom]: "足の裏のぴりぴり" } });
    // 再読み込み（GET）でも同じ
    expect((await body(await getSymptoms(req(pa)))).json.settings.active[0]).toBe("numbness");
    // 非表示にした症状の過去の記録は残る
    const recs = (await body(await listRecords(req(pa)))).json.records;
    expect(recs.some((r: { symptoms: { key: string; severity: number }[] }) => r.symptoms.some((s) => s.key === "hotFlash" && s.severity === 3))).toBe(true);
    // 独自の症状を記録すると、保存時の名前が残る
    const r = await body(await createRecord(req(pa, { measuredAt: at(1), vitals: {}, symptoms: [{ key: custom, severity: 1, location: "両足" }] })));
    expect(r.json.record.symptoms[0]).toMatchObject({ key: custom, name: "足の裏のぴりぴり", severity: 1, location: "両足" });
    // 他の患者の設定は変わらない
    expect((await body(await getSymptoms(req(await loginHeaders(PATIENT_B))))).json.settings.active[0]).toBe("fatigue");
  });
});

describe("診察ノート（Step 3）", () => {
  it("教材に紐づかない質問の作成・編集・削除。理解確認の候補は回答した設問だけ教材付きで保存。他の患者は変更できない", async () => {
    const pb = await loginHeaders(PATIENT_B);
    const pa = await loginHeaders(PATIENT_A);
    const n = await body(await createNote(req(pb, { body: "  治療中に旅行に行ってもよいですか？  " })));
    expect(n.json.note).toMatchObject({ body: "治療中に旅行に行ってもよいですか？", source: "free", materialId: null });
    expect((await createNote(req(pb, { body: "   " }))).status).toBe(400);
    const e = await body(await updateNote(req(pb, { body: "来月、2泊の旅行に行ってもよいですか？" }, "PATCH"), ctx("id", n.json.note.id)));
    expect(e.json.note.body).toBe("来月、2泊の旅行に行ってもよいですか？");
    expect(new Date(e.json.note.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(e.json.note.createdAt).getTime());
    expect((await updateNote(req(pa, { body: "改ざん" }, "PATCH"), ctx("id", n.json.note.id))).status).toBe(404);
    expect((await deleteNote(req(pa, undefined, "DELETE"), ctx("id", n.json.note.id))).status).toBe(404);
    expect((await body(await listNotes(req(pa)))).json.notes.some((x: { id: string }) => x.id === n.json.note.id)).toBe(false);

    // 理解確認から作った候補: 回答した設問なら教材付きで保存できる
    const lib = (await body(await libraryRoute(req(pb)))).json.items as { versionId: string; questionCount: number }[];
    const v = lib.find((i) => i.questionCount > 0)!.versionId;
    const a = (await body(await startAttempt(req(pb, {}), ctx("versionId", v)))).json;
    expect((await createNote(req(pb, { body: "わからなかった", versionId: v, questionId: a.questions[0].questionId }))).status).toBe(400);
    await answerRoute(req(pb, { questionId: a.questions[0].questionId, selectedIndex: null }), ctx("attemptId", a.attemptId));
    const q = await body(await createNote(req(pb, { body: "この設問について私の場合を教えてください", versionId: v, questionId: a.questions[0].questionId })));
    expect(q.json.note.source).toBe("quiz");
    expect(q.json.note.materialId).toBeTruthy();

    const d = await body(await deleteNote(req(pb, undefined, "DELETE"), ctx("id", q.json.note.id)));
    expect(d.json.deleted).toBe(true);
    expect((await body(await listNotes(req(pb)))).json.notes).toHaveLength(1);
  });

  it("医療者は有効な一時共有の間だけ、診察ノートの質問と体調記録を読める。終了後・他院の医療者は拒否", async () => {
    const pb = await loginHeaders(PATIENT_B);
    await createNote(req(pb, { body: "しびれが続くときは連絡したほうがよいですか？" }));
    const staff = await loginHeaders(DR_YAMADA);
    const { sessionId } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const sum = (await body(await patientSummary(req(staff), ctx("id", sessionId)))).json;
    expect(sum.visitNotes.map((n: { body: string }) => n.body)).toContain("しびれが続くときは連絡したほうがよいですか？");
    const h = await body(await clinicianHealth(req(staff), ctx("id", sessionId)));
    expect(h.status).toBe(200);
    expect(Array.isArray(h.json.records)).toBe(true);
    // 共有の当事者でない医療者は読めない
    expect((await clinicianHealth(req(await loginHeaders(DR_KOBAYASHI)), ctx("id", sessionId))).status).toBe(403);
    await endRoute(req(pb, {}), ctx("id", sessionId));
    expect((await clinicianHealth(req(staff), ctx("id", sessionId))).status).toBe(403);
    expect((await patientSummary(req(staff), ctx("id", sessionId))).status).toBe(403);
  });
});
