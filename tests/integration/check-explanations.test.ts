import { beforeAll, describe, expect, it } from "vitest";
import { POST as checksPost } from "@/app/api/v1/consultations/[id]/checks/route";
import { GET as patientGet } from "@/app/api/v1/consultations/[id]/patient/route";
import { POST as endRoute } from "@/app/api/v1/consultations/[id]/end/route";
import { GET as materialsRoute } from "@/app/api/v1/consultations/[id]/materials/route";
import { POST as prescribeRoute } from "@/app/api/v1/consultations/[id]/prescriptions/route";
import { GET as libraryRoute } from "@/app/api/v1/library/route";
import { POST as startAttempt } from "@/app/api/v1/learn/[versionId]/attempts/route";
import { POST as answerRoute } from "@/app/api/v1/attempts/[attemptId]/answers/route";
import { DR_YAMADA, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

/**
 * 2026-11: 診察サマリーの「理解を確認したいこと」に医療者が「説明した」の印を付ける／外す。
 * 有効な一時共有の中の医療者だけ。印は診察サマリーの回答に explainedAt として載るだけで、採点・学習の記録は変わらない。
 */
let seeded: Seeded;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pctx = <K extends string>(key: K, id: string) => ({ params: Promise.resolve({ [key]: id } as Record<K, string>) });
const req = (headers: Headers, json?: unknown, method?: string) =>
  new Request("http://localhost:3000/x", {
    method: method ?? (json === undefined ? "GET" : "POST"),
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });
type Answer = { attemptId: string; questionId: string; isCorrect: boolean; explainedAt?: string | null };

beforeAll(async () => {
  seeded = await setupDb();
});

describe("説明した（理解確認の設問）", () => {
  it("誤答に印を付けると explainedAt が載り、正答率の元になる回答数・正誤は変わらない。外せる。他人の回答・不正な ID は 400。終了後は 403", async () => {
    const { sessionId: sid } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const h = await loginHeaders(DR_YAMADA);
    // 準備: 処方した教材の理解確認で患者が 1 問誤答する（学習記録のテストと同じ手順）
    const patient = await loginHeaders(PATIENT_B);
    const mats = (await body(await materialsRoute(req(h), ctx(sid)))).json.items as { materialId: string; title: string }[];
    const m = mats.find((x) => x.title === "乳がんの診断と病期の考え方")!;
    expect((await prescribeRoute(req(h, { materialIds: [m.materialId] }), ctx(sid))).status).toBe(200);
    const lib = (await body(await libraryRoute(req(patient)))).json.items as { materialId: string; versionId: string }[];
    const a = (await body(await startAttempt(req(patient, {}), pctx("versionId", lib.find((i) => i.materialId === m.materialId)!.versionId)))).json;
    const wrongIndex = (a.questions[1].options as string[]).indexOf("必ず同じ治療になる");
    await answerRoute(req(patient, { questionId: a.questions[1].questionId, selectedIndex: wrongIndex }), pctx("attemptId", a.attemptId));
    const before = (await body(await patientGet(req(h), ctx(sid)))).json.answers as Answer[];
    const wrong = before.find((a) => !a.isCorrect);
    expect(wrong, "シードに誤答がある").toBeTruthy();
    const marked = await body(await checksPost(req(h, { attemptId: wrong!.attemptId, questionId: wrong!.questionId }), ctx(sid)));
    expect(marked.status).toBe(200);
    expect(marked.json.explained).toHaveLength(1);
    const after = (await body(await patientGet(req(h), ctx(sid)))).json.answers as Answer[];
    expect(after).toHaveLength(before.length);
    expect(after.map((a) => a.isCorrect)).toEqual(before.map((a) => a.isCorrect));
    const hit = after.find((a) => a.attemptId === wrong!.attemptId && a.questionId === wrong!.questionId)!;
    expect(hit.explainedAt).toBeTruthy();
    // 外す
    const cleared = await body(await checksPost(req(h, { attemptId: wrong!.attemptId, questionId: wrong!.questionId, explained: false }), ctx(sid)));
    expect(cleared.json.explained).toEqual([]);
    // 不正な指定
    expect((await checksPost(req(h, { attemptId: "nope", questionId: wrong!.questionId }), ctx(sid))).status).toBe(400);
    expect((await checksPost(req(h, { attemptId: "00000000-0000-4000-8000-000000000000", questionId: wrong!.questionId }), ctx(sid))).status).toBe(400);
    // 終了後は 403
    await endRoute(req(h, {}), ctx(sid));
    expect((await checksPost(req(h, { attemptId: wrong!.attemptId, questionId: wrong!.questionId }), ctx(sid))).status).toBe(403);
  });
});
