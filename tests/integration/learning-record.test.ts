import { beforeAll, describe, expect, it } from "vitest";
import { GET as libraryRoute } from "@/app/api/v1/library/route";
import { GET as patientSummary } from "@/app/api/v1/consultations/[id]/patient/route";
import { GET as materialsRoute } from "@/app/api/v1/consultations/[id]/materials/route";
import { POST as prescribeRoute } from "@/app/api/v1/consultations/[id]/prescriptions/route";
import { POST as endRoute } from "@/app/api/v1/consultations/[id]/end/route";
import { POST as startAttempt } from "@/app/api/v1/learn/[versionId]/attempts/route";
import { POST as answerRoute } from "@/app/api/v1/attempts/[attemptId]/answers/route";
import { DR_YAMADA, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

/**
 * Phase 2 Step 2: 情報処方と学習記録。患者画面と医療者画面が同じ記録（DB）を参照し、
 * 「わからない」と誤答を区別、途中の挑戦の回答も根拠として医療者に見える。医療者の閲覧は有効な共有の間だけ。
 */
let seeded: Seeded;
const ctx = <K extends string>(key: K, id: string) => ({ params: Promise.resolve({ [key]: id } as Record<K, string>) });
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

describe("情報処方と学習記録（Step 2）", () => {
  it("処方 → 患者の一覧に届く → 「わからない」と誤答（途中）→ 次の共有で医療者が回答を確認 → 終了後は拒否", async () => {
    const staff = await loginHeaders(DR_YAMADA);
    const patient = await loginHeaders(PATIENT_B);
    const { sessionId: s1 } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");

    const mats = (await body(await materialsRoute(req(staff), ctx("id", s1)))).json.items as { materialId: string; title: string; objectives: string[] }[];
    const m = mats.find((x) => x.title === "乳がんの診断と病期の考え方")!;
    expect(m.objectives.length).toBeGreaterThan(0);
    const rx = await body(await prescribeRoute(req(staff, { materialIds: [m.materialId], note: "次回までに読んでおいてください" }), ctx("id", s1)));
    expect(rx.status).toBe(200);
    // 同じ診察で同じ教材を重ねて処方しても 1 件
    const again = await body(await prescribeRoute(req(staff, { materialIds: [m.materialId] }), ctx("id", s1)));
    expect(again.json.set.items).toHaveLength(1);
    // メッセージは 120 字まで
    expect((await prescribeRoute(req(staff, { materialIds: [m.materialId], note: "あ".repeat(121) }), ctx("id", s1))).status).toBe(400);

    // 患者の一覧: 今回の処方・処方元・メッセージ・学習目標
    const lib = (await body(await libraryRoute(req(patient)))).json.items as Record<string, unknown>[];
    const item = lib.find((i) => i.materialId === m.materialId)!;
    expect(item).toMatchObject({ phase: "not_started", objective: m.objectives[0] });
    expect(item.prescribed).toMatchObject({ latest: true, clinicianName: "山田 医師", note: "次回までに読んでおいてください" });

    // 理解確認: 1 問目「わからない」、2 問目 誤答、3 問目は未回答（途中）
    const a = (await body(await startAttempt(req(patient, {}), ctx("versionId", item.versionId as string)))).json;
    await answerRoute(req(patient, { questionId: a.questions[0].questionId, selectedIndex: null }), ctx("attemptId", a.attemptId));
    const wrongIndex = a.questions[1].options.indexOf("必ず同じ治療になる");
    await answerRoute(req(patient, { questionId: a.questions[1].questionId, selectedIndex: wrongIndex }), ctx("attemptId", a.attemptId));
    await endRoute(req(staff, {}), ctx("id", s1));

    // 次の承認済み共有で、医療者が回答そのもの（設問・回答・正答・解説・日時・教材）を確認できる
    const { sessionId: s2 } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const sum = (await body(await patientSummary(req(staff), ctx("id", s2)))).json;
    expect(sum.patientName).toBe("鈴木 美咲");
    expect(sum.answers).toHaveLength(2);
    const [unknown, wrong] = sum.answers;
    expect(unknown).toMatchObject({ isUnknown: true, isCorrect: false, selectedText: null, correctText: "患者さんの年齢", attemptCompleted: false, materialTitle: m.title });
    expect(wrong).toMatchObject({ isUnknown: false, isCorrect: false, selectedText: "必ず同じ治療になる", primaryDomain: "diagnosis_staging" });
    expect(typeof unknown.explanation).toBe("string");
    expect(new Date(unknown.answeredAt).getTime()).toBeGreaterThan(0);
    expect(sum.learning.find((l: { materialId: string }) => l.materialId === m.materialId)).toMatchObject({ prescribed: true, phase: "quiz" });
    // この診察ではまだ処方していない（前回の処方は再処方できる）
    expect(sum.currentSet).toBeNull();

    // 終了後は拒否
    await endRoute(req(patient, {}), ctx("id", s2));
    for (const sid of [s1, s2]) {
      expect((await patientSummary(req(staff), ctx("id", sid))).status).toBe(403);
      expect((await materialsRoute(req(staff), ctx("id", sid))).status).toBe(403);
    }
    expect((await prescribeRoute(req(staff, { materialIds: [m.materialId] }), ctx("id", s2))).status).toBe(403);
  });

  it("患者の教材一覧は患者本人だけ（医療者・未ログインは不可）", async () => {
    expect((await libraryRoute(req(await loginHeaders(DR_YAMADA)))).status).toBe(403);
    expect((await libraryRoute(req(new Headers()))).status).toBe(401);
  });
});
