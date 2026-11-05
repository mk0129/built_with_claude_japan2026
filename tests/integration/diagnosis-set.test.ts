import { beforeAll, describe, expect, it } from "vitest";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { listHomeworkForPatient, prescribe } from "@/server/services/prescription";
import { getPatientLibrary } from "@/server/services/library";
import { DR_YAMADA, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

let seeded: Seeded;
const uid = (email: string) => seeded.users.get(email)!;
const mat = (title: string) => seeded.materials.get(title)!;

const SET = ["乳がんの診断と病期の考え方", "サブタイプと治療方針のつながり", "こころのケアと相談先"]; // 初回診断時セット
const OTHER = "化学療法中の副作用とセルフケア";

beforeAll(async () => {
  seeded = await setupDb();
});

describe("患者の診断時セット表示（処方の記録とテンプレートの教材の一致）", () => {
  it("テンプレートの教材が一部だけの処方ではセットにならない", async () => {
    const { sessionId: sid } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const ctx = await requireActiveConsultation(await loginHeaders(DR_YAMADA), sid);
    await prescribe(ctx, [mat(SET[0]), mat(SET[1])]);
    const [latest] = await listHomeworkForPatient(uid(PATIENT_B));
    expect(latest.templates).toEqual([]);
    const lib = await getPatientLibrary(uid(PATIENT_B));
    expect(lib.latestSetTemplates).toEqual([]);
  });

  it("テンプレートの教材がすべて含まれる処方は、そのセットとして返る（ほかの教材が混ざってもよい）", async () => {
    const { sessionId: sid } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const ctx = await requireActiveConsultation(await loginHeaders(DR_YAMADA), sid);
    await prescribe(ctx, [...SET.map(mat), mat(OTHER)]);
    const [latest] = await listHomeworkForPatient(uid(PATIENT_B));
    const names = latest.templates.map((t) => t.name);
    expect(names).toContain("初回診断時セット");
    const t = latest.templates.find((x) => x.name === "初回診断時セット")!;
    expect(new Set(t.materialIds)).toEqual(new Set(SET.map(mat)));
    // 患者の教材一覧（ホーム）でも最新の処方のセットとして返り、教材は実際に処方されたもの
    const lib = await getPatientLibrary(uid(PATIENT_B));
    expect(lib.latestSetTemplates.map((x) => x.name)).toContain("初回診断時セット");
    const latestIds = lib.items.filter((i) => i.prescribed?.latest).map((i) => i.materialId);
    for (const id of t.materialIds) expect(latestIds).toContain(id);
  });
});
