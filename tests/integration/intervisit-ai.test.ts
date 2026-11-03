import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as createRecord } from "@/app/api/v1/health/records/route";
import { PATCH as updateRecord } from "@/app/api/v1/health/records/[id]/route";
import { POST as createNote } from "@/app/api/v1/notes/route";
import { POST as summaryRoute } from "@/app/api/v1/consultations/[id]/intervisit/summary/route";
import { POST as endRoute } from "@/app/api/v1/consultations/[id]/end/route";
import { buildIntervisit } from "@/server/services/intervisit";
import { summarizeIntervisit, validateItems } from "@/server/services/intervisit-ai";
import { ruleSummary } from "@/server/services/intervisit-rules";
import { getDb } from "@/server/db/client";
import { seedDemoHistory } from "@/server/db/seed-history";
import { seedDemoHealth } from "@/server/db/seed-health";
import { localDay } from "@/server/services/intervisit-format";
import { DR_YAMADA, PATIENT_A, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

/**
 * Phase 2 Step 4-C: Claude の外来間要約（テストは Claude をモックに置き換える。実 API は呼ばない）。
 * 根拠 ID・数値・日付・時刻・引用の検証、禁止された記述での代替表示、生成失敗時の代替表示、
 * 架空患者以外は送らないこと、元データの変更が再生成に反映されること、共有終了後の拒否。
 */
type Mock = (args: { system: string; user: string; schemaName: string }) => Promise<unknown>;
const g = globalThis as { __shioriClaudeMock?: Mock };
let calls = 0;
const mock = (fn: (data: { sources: { id: string; at?: string; content: string }[]; questions: { id: string; text: string }[] }) => unknown) => {
  g.__shioriClaudeMock = async ({ user }) => {
    calls++;
    const json = JSON.parse(user.match(/<intervisit_data>\n([\s\S]*)\n<\/intervisit_data>/)![1]);
    return fn(json);
  };
};
afterEach(() => {
  delete g.__shioriClaudeMock;
  calls = 0;
});

let seeded: Seeded;
const ctx = <K extends string>(key: K, id: string) => ({ params: Promise.resolve({ [key]: id } as Record<K, string>) });
const req = (headers: Headers, json?: unknown, method?: string) =>
  new Request("http://localhost:3000/x", {
    method: method ?? (json === undefined ? "GET" : "POST"),
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });
const jst = (daysAgo: number, hh: number) => {
  const t = new Date(`${localDay(new Date())}T${String(hh).padStart(2, "0")}:00:00+09:00`);
  return new Date(t.getTime() - daysAgo * 86400_000).toISOString();
};

let pb: Headers;
let staff: Headers;
let sessionId: string;
let recA: string;
let recB: string;
beforeAll(async () => {
  seeded = await setupDb();
  pb = await loginHeaders(PATIENT_B);
  staff = await loginHeaders(DR_YAMADA);
  recA = (await body(await createRecord(req(pb, { measuredAt: jst(6, 8), vitals: { temperature: 36.5 }, symptoms: [{ key: "numbness", severity: 3 }] })))).json.record.id;
  recB = (await body(await createRecord(req(pb, { measuredAt: jst(1, 8), vitals: { temperature: 36.7 }, symptoms: [{ key: "numbness", severity: 2 }] })))).json.record.id;
  await createNote(req(pb, { body: "しびれは治療終了後に戻りますか？" }));
  sessionId = (await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general")).sessionId;
});

const md = (iso: string) => {
  const d = localDay(new Date(iso));
  return `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
};

describe("Claude の外来間要約（Step 4-C・モック）", () => {
  it("元データの ID・値で書かれた要約は表示し、各文から根拠をたどれる", async () => {
    mock((data) => {
      const sym = data.sources.filter((s) => s.id.startsWith("hs:"));
      const q = data.questions[0];
      return {
        items: [
          { section: "体調の変化", text: `${md(sym[0].at!.replace(/^(\d+)月(\d+)日.*/, "") || jst(6, 8))}に手足のしびれを3/4と記録し、${md(jst(1, 8))}は2/4でした。`, sourceIds: [sym[0].id, sym[1].id] },
          { section: "患者からの質問", text: `「${q.text}」という質問を保存しています。`, sourceIds: [q.id] },
          { section: "時系列の経過", text: `${md(jst(1, 8))}：手足のしびれ 2/4。`, sourceIds: [sym[1].id] },
        ],
      };
    });
    const r = await body(await summaryRoute(req(staff, {}), ctx("id", sessionId)));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "ai", generator: "mock", rejected: [] });
    expect(r.json.items).toHaveLength(3);
    expect(r.json.items[0].text).toContain("3/4");
    for (const it of r.json.items) for (const sid of it.sourceIds) expect(r.json.sources[sid]).toBeTruthy();
    expect(r.json.items[0].sourceIds).toEqual([`hs:${recA}:numbness`, `hs:${recB}:numbness`]);
    // 同じデータならキャッシュ（Claude を再度呼ばない）
    const again = await body(await summaryRoute(req(staff, {}), ctx("id", sessionId)));
    expect(again.json.cached).toBe(true);
    expect(calls).toBe(1);
  });

  it("元データにない数値・日付・引用・ID の項目は表示しない。多ければ要約全体をルールベースに切り替える", async () => {
    const iv = await buildIntervisit({ patientId: seeded.users.get(PATIENT_B)!, sessionId });
    const sid = `hs:${recA}:numbness`;
    const { valid, rejected } = validateItems(
      [
        { section: "体調の変化", text: `${md(jst(6, 8))}に手足のしびれを3/4と記録しました。`, sourceIds: [sid] },
        { section: "体調の変化", text: `${md(jst(6, 8))}に手足のしびれを4/4と記録しました。`, sourceIds: [sid] },
        { section: "体調の変化", text: `${md(jst(3, 8))}に手足のしびれを3/4と記録しました。`, sourceIds: [sid] },
        { section: "体調の変化", text: "体温は38.5℃でした。", sourceIds: [sid] },
        { section: "患者からの質問", text: "「しびれは治りますか？」", sourceIds: [iv.questions[0].sourceId] },
        { section: "体調の変化", text: "記録しました。", sourceIds: ["hr:unknown"] },
        { section: "体調の変化", text: "08:00に記録しました。", sourceIds: [sid] },
        { section: "体調の変化", text: "09:15に記録しました。", sourceIds: [sid] },
      ],
      iv,
    );
    expect(valid.map((v) => v.text)).toEqual([`${md(jst(6, 8))}に手足のしびれを3/4と記録しました。`, "08:00に記録しました。"]);
    expect(rejected.map((r) => r.reason)).toEqual(["根拠にない数値", "根拠にない日付", "根拠にない数値", "引用が原文と一致しない", "存在しない根拠 ID", "根拠にない時刻"]);
  });

  it("件数は根拠から計算した値と一致すること。質問は原文全体を引用し、言い換えは時系列だけ", async () => {
    const iv = await buildIntervisit({ patientId: seeded.users.get(PATIENT_B)!, sessionId });
    const a = `hs:${recA}:numbness`;
    const b = `hs:${recB}:numbness`;
    const q = iv.questions[0];
    const { valid, rejected } = validateItems(
      [
        { section: "体調の変化", text: "手足のしびれは2回記録されました。", sourceIds: [a, b] },
        { section: "体調の変化", text: "手足のしびれは3回記録されました。", sourceIds: [a, b] },
        { section: "体調の変化", text: "記録は2日でした。", sourceIds: [a, b] },
        { section: "体調の変化", text: "記録は1日でした。", sourceIds: [a, b] },
        { section: "患者からの質問", text: `「${q.body}」`, sourceIds: [q.sourceId] },
        { section: "患者からの質問", text: "しびれが戻るかを質問しています。", sourceIds: [q.sourceId] },
        { section: "患者からの質問", text: "「しびれは戻りますか」", sourceIds: [q.sourceId] },
        { section: "時系列の経過", text: `${md(q.createdAt)}：しびれについての質問を保存しました。`, sourceIds: [q.sourceId] },
        { section: "体調の変化", text: "しびれについての質問を保存しました。", sourceIds: [q.sourceId] },
        { section: "時系列の経過", text: "「しびれは戻らないのですか」と質問しました。", sourceIds: [q.sourceId] },
      ],
      iv,
    );
    expect(valid.map((v) => v.text)).toEqual([
      "手足のしびれは2回記録されました。",
      "記録は2日でした。",
      `「${q.body}」`,
      `${md(q.createdAt)}：しびれについての質問を保存しました。`,
    ]);
    expect(rejected.map((r) => r.reason)).toEqual([
      "件数が根拠と一致しない",
      "件数が根拠と一致しない",
      "質問の原文が引用されていない",
      "引用が原文と一致しない",
      "質問の言い換えは時系列の経過だけで使える",
      "引用が原文と一致しない",
    ]);
  });

  it("理解確認の件数（「3問中2問は正答」）は結果別に数えて検証する", async () => {
    const iv = await buildIntervisit({ patientId: seeded.users.get(PATIENT_B)!, sessionId });
    // 理解確認の回答を作る（1 問目わからない・2 問目正答・3 問目誤答）
    const fake = {
      ...iv,
      events: [
        ...iv.events,
        { id: "qa:t1", kind: "answer" as const, at: jst(2, 9), day: "", label: "理解確認（わからない）：「設問1」", ref: { table: "quiz_answers", id: "t1" }, data: { result: "わからない" } },
        { id: "qa:t2", kind: "answer" as const, at: jst(2, 9), day: "", label: "理解確認（正答）：「設問2」", ref: { table: "quiz_answers", id: "t2" }, data: { result: "正答" } },
        { id: "qa:t3", kind: "answer" as const, at: jst(2, 9), day: "", label: "理解確認（誤答）：「設問3」", ref: { table: "quiz_answers", id: "t3" }, data: { result: "誤答" } },
      ],
    };
    const ids = ["qa:t1", "qa:t2", "qa:t3"];
    const ok = (text: string) => validateItems([{ section: "学習の状況", text, sourceIds: ids }], fake).valid.length === 1;
    expect(ok("理解確認3問中1問は正答、1問は誤答、1問は「わからない」でした。")).toBe(true);
    expect(ok("理解確認3問中2問は正答でした。")).toBe(false);
    expect(ok("理解確認4問中1問は正答でした。")).toBe(false);
    expect(ok("理解確認3問のうち2問は「わからない」でした。")).toBe(false);
  });

  it("解釈・診断・因果・Grade・理解能力の記述があれば、要約全体を表示しない（安全な代替表示）", async () => {
    const iv = await buildIntervisit({ patientId: seeded.users.get(PATIENT_B)!, sessionId });
    const sid = `hs:${recB}:numbness`;
    for (const text of ["手足のしびれは改善しています。", "しびれは抗がん薬の副作用による可能性があります。", "CTCAE Grade 2 相当です。", "「わからない」が多く理解力が不十分です。", "記録がない日は症状なしでした。", "減量を検討してください。"]) {
      const { safetyViolation } = validateItems([{ section: "体調の変化", text, sourceIds: [sid] }], iv);
      expect(safetyViolation, text).toBe(true);
    }
    mock(() => ({ items: [{ section: "体調の変化", text: "しびれは改善しています。", sourceIds: [sid] }] }));
    const r = await body(await summaryRoute(req(staff, { regenerate: true }), ctx("id", sessionId)));
    expect(r.json.status).toBe("fallback");
    expect(r.json.generator).toBe("rule");
    expect(r.json.fallbackReason).toContain("安全上の記述");
    // 不採用の本文は医療者向けの API に返さない
    expect(r.json.rejectedItems).toBeUndefined();
    expect(JSON.stringify(r.json)).not.toContain("しびれは改善しています");
    // 代替表示はルールベースの要約（元データは表示できる）
    expect(r.json.items.some((i: { text: string }) => i.text.includes("しびれは治療終了後に戻りますか？"))).toBe(true);
  });

  it("Claude の呼び出しが失敗しても、患者情報を含まない理由でルールベースに切り替える", async () => {
    g.__shioriClaudeMock = async () => {
      throw new Error("network down: しびれは治療終了後に戻りますか？");
    };
    const r = await body(await summaryRoute(req(staff, { regenerate: true }), ctx("id", sessionId)));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "fallback", generator: "rule" });
    expect(r.json.fallbackReason).toMatch(/AI 要約を生成できませんでした（[A-Z_]+）/);
    expect(r.json.fallbackReason).not.toContain("しびれ");
  });

  it("架空のデモ患者以外は外部 AI に送らない", async () => {
    mock(() => ({ items: [] }));
    const iv = await buildIntervisit({ patientId: seeded.users.get(PATIENT_B)!, sessionId });
    const r = await summarizeIntervisit(iv, { sessionId, fictional: false, regenerate: true });
    expect(r.status).toBe("fallback");
    expect(calls).toBe(0);
  });

  it("元データを変更すると、再生成した要約に反映される（データのハッシュが変わり再生成）", async () => {
    const seen: string[] = [];
    mock((data) => {
      const s = data.sources.find((x) => x.id === `hs:${recB}:numbness`)!;
      seen.push(s.content);
      const sev = s.content.match(/(\d)\/4/)![1];
      return { items: [
        { section: "体調の変化", text: `${md(jst(1, 8))}は手足のしびれ${sev}/4でした。`, sourceIds: [s.id] },
        { section: "患者からの質問", text: `「${data.questions[0].text}」`, sourceIds: [data.questions[0].id] },
      ] };
    });
    const before = await body(await summaryRoute(req(staff, { regenerate: true }), ctx("id", sessionId)));
    expect(before.json.items[0].text).toContain("2/4");
    await updateRecord(req(pb, { measuredAt: jst(1, 8), vitals: { temperature: 36.7 }, symptoms: [{ key: "numbness", severity: 1 }] }, "PATCH"), ctx("id", recB));
    const after = await body(await summaryRoute(req(staff, {}), ctx("id", sessionId)));
    expect(after.json.cached).toBe(false);
    expect(after.json.dataHash).not.toBe(before.json.dataHash);
    expect(after.json.items[0].text).toContain("1/4");
    expect(seen).toHaveLength(2);
  });

  it("ルールベースの要約は、同じ検証をすべて通る（デモ患者A の記録・学習・質問・期間の切り替え）", async () => {
    const patientId = seeded.users.get(PATIENT_A)!;
    await seedDemoHistory(getDb(), { patientId, clinicianId: seeded.users.get(DR_YAMADA)!, orgId: seeded.orgs.get("sakura-general")!, materialIdByTitle: seeded.materials });
    await seedDemoHealth(getDb(), patientId);
    for (const range of [{}, { from: localDay(new Date(Date.now() - 27 * 86400_000)), to: localDay(new Date()) }, { from: localDay(new Date(Date.now() - 3 * 86400_000)), to: localDay(new Date()) }]) {
      const iv = await buildIntervisit({ patientId, ...range });
      const items = ruleSummary(iv);
      expect(items.length).toBeGreaterThan(3);
      const { valid, rejected, safetyViolation } = validateItems(items, iv);
      expect(rejected, JSON.stringify(rejected.map((r) => [r.reason, items[r.index].text]))).toEqual([]);
      expect(safetyViolation).toBe(false);
      expect(valid).toHaveLength(items.length);
    }
  });

  it("共有終了後は要約 API も拒否", async () => {
    await endRoute(req(pb, {}), ctx("id", sessionId));
    expect((await summaryRoute(req(staff, {}), ctx("id", sessionId))).status).toBe(403);
  });
});
