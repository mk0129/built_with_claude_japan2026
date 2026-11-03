import { beforeAll, describe, expect, it } from "vitest";
import { POST as createRecord } from "@/app/api/v1/health/records/route";
import { POST as createNote } from "@/app/api/v1/notes/route";
import { GET as intervisitRoute } from "@/app/api/v1/consultations/[id]/intervisit/route";
import { POST as endRoute } from "@/app/api/v1/consultations/[id]/end/route";
import { POST as startAttempt } from "@/app/api/v1/learn/[versionId]/attempts/route";
import { POST as answerRoute } from "@/app/api/v1/attempts/[attemptId]/answers/route";
import { GET as libraryRoute } from "@/app/api/v1/library/route";
import { resolvePeriod } from "@/server/services/intervisit";
import { localDay } from "@/server/services/intervisit-format";
import { DR_KOBAYASHI, DR_YAMADA, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

/**
 * Phase 2 Step 4-B: 外来間の構造化データ。日時（日本時間で日付を区切る）・欠測・同じ日の複数回・症状の新規/変化/途切れ・
 * 学習と回答・質問の統合、安定した ID と時刻順、ルールベースの要約の根拠、有効な共有の間だけ読めること。
 */
let seeded: Seeded;
const ctx = <K extends string>(key: K, id: string) => ({ params: Promise.resolve({ [key]: id } as Record<K, string>) });
const req = (headers: Headers, json?: unknown, url = "http://localhost:3000/x") =>
  new Request(url, {
    method: json === undefined ? "GET" : "POST",
    headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const body = async (r: Response) => ({ status: r.status, json: await r.json() });
/** 日本時間で n 日前の hh:mm */
const jst = (daysAgo: number, hh: number, mm = 0) => {
  const today = localDay(new Date());
  const t = new Date(`${today}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`);
  return new Date(t.getTime() - daysAgo * 86400_000).toISOString();
};

beforeAll(async () => {
  seeded = await setupDb();
});

describe("外来間の構造化データ（Step 4-B）", () => {
  it("期間の解決: 既定は直近 14 日、未来・逆順・長すぎる期間は拒否", () => {
    const p = resolvePeriod(null, null, new Date("2026-11-04T01:00:00+09:00"));
    expect(p).toMatchObject({ from: "2026-10-22", to: "2026-11-04", days: 14, isDefault: true });
    // 日本時間の 0:30 は UTC では前日 — 日付は日本時間で区切る
    expect(resolvePeriod(null, null, new Date("2026-11-03T15:30:00Z")).to).toBe("2026-11-04");
    expect(() => resolvePeriod("2026-11-05", "2026-11-01")).toThrow();
    expect(() => resolvePeriod("2026-01-01", localDay(new Date()))).toThrow();
  });

  it("体調・学習・回答・質問を統合し、欠測・同じ日の複数回・症状の変化を区別する。終了後は 403", async () => {
    const pb = await loginHeaders(PATIENT_B);
    const rec = async (at: string, vitals: Record<string, number>, symptoms: { key: string; severity: number }[]) =>
      (await body(await createRecord(req(pb, { measuredAt: at, vitals, symptoms })))).json.record.id as string;
    const r1 = await rec(jst(6, 8), { temperature: 36.4, pulse: 70 }, [{ key: "numbness", severity: 1 }, { key: "fatigue", severity: 0 }]);
    // 5 日前・4 日前は未記録。3 日前に 2 回
    const r2 = await rec(jst(3, 8), { temperature: 37.4 }, [{ key: "numbness", severity: 3 }, { key: "fatigue", severity: 1 }]);
    const r3 = await rec(jst(3, 20, 30), { systolic: 128, diastolic: 82 }, [{ key: "numbness", severity: 2 }]);
    const r4 = await rec(jst(1, 9), { temperature: 36.6 }, [{ key: "numbness", severity: 2 }]);
    // 期間外（30 日前）の記録は含めない
    await rec(jst(30, 9), { temperature: 39 }, [{ key: "rash", severity: 4 }]);
    await createNote(req(pb, { body: "しびれは治療が終わったら戻りますか？" }));
    const lib = (await body(await libraryRoute(req(pb)))).json.items as { versionId: string; questionCount: number; title: string }[];
    const v = lib.find((i) => i.questionCount > 0)!;
    const a = (await body(await startAttempt(req(pb, {}), ctx("versionId", v.versionId)))).json;
    await answerRoute(req(pb, { questionId: a.questions[0].questionId, selectedIndex: null }), ctx("attemptId", a.attemptId));

    const staff = await loginHeaders(DR_YAMADA);
    const { sessionId } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const res = await body(await intervisitRoute(req(staff, undefined, "http://localhost:3000/x"), ctx("id", sessionId)));
    expect(res.status).toBe(200);
    const iv = res.json.intervisit;
    expect(iv.period).toMatchObject({ days: 14, label: "直近14日間" });
    // A. バイタル: 4 件・3 日（同じ日の 2 回を別々に保持）、最小・最大、欠測日
    expect(iv.vitals).toMatchObject({ recordCount: 4, recordDays: 3, totalDays: 14 });
    expect(iv.vitals.missingDays).toHaveLength(11);
    expect(iv.vitals.metrics.temperature).toMatchObject({ count: 3, min: { value: 36.4, sourceId: `hr:${r1}` }, max: { value: 37.4, sourceId: `hr:${r2}` } });
    expect(iv.vitals.metrics.systolic).toMatchObject({ count: 1, min: { value: 128 } });
    expect(iv.vitals.metrics.spo2.count).toBe(0);
    // B. 症状: しびれ 1→3→2→2（変化あり）、だるさは 3 日前の後に記録あるが未回答（途切れ）、期間外の発疹は含めない
    const numb = iv.symptoms.find((s: { key: string }) => s.key === "numbness");
    expect(numb).toMatchObject({ count: 4, min: 1, max: 3, changed: true, newInPeriod: true, first: { severity: 1 }, last: { severity: 2, sourceId: `hs:${r4}:numbness` } });
    const fat = iv.symptoms.find((s: { key: string }) => s.key === "fatigue");
    expect(fat).toMatchObject({ count: 2, min: 0, max: 1, stoppedRecording: true });
    expect(iv.symptoms.some((s: { key: string }) => s.key === "rash")).toBe(false);
    // C. 学習・回答、D. 質問
    expect(iv.events.some((e: { kind: string; data: { result?: string } }) => e.kind === "answer" && e.data.result === "わからない")).toBe(true);
    expect(iv.events.some((e: { kind: string }) => e.kind === "learning_start")).toBe(true);
    expect(iv.questions).toEqual([expect.objectContaining({ kind: "診察ノート", body: "しびれは治療が終わったら戻りますか？" })]);
    // 安定した ID・重複なし・時刻順（同じ日の 2 回も時刻順）
    const ids = iv.events.map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const times = iv.events.map((e: { at: string }) => e.at);
    expect([...times].sort()).toEqual(times);
    expect(ids.indexOf(`hr:${r2}`)).toBeLessThan(ids.indexOf(`hr:${r3}`));
    // 同じ期間・同じデータなら同じ ID（安定）
    const again = (await body(await intervisitRoute(req(staff), ctx("id", sessionId)))).json.intervisit;
    expect(again.events.map((e: { id: string }) => e.id)).toEqual(ids);

    // ルールベースの要約: すべての文に根拠 ID があり、すべて存在する。解釈の語を使わない
    const items = res.json.ruleSummary as { section: string; text: string; sourceIds: string[] }[];
    const sources = res.json.sources as Record<string, unknown>;
    for (const it of items) {
      expect(it.sourceIds.length).toBeGreaterThan(0);
      for (const sid of it.sourceIds) expect(sources[sid]).toBeTruthy();
      // 「」内（教材名・設問・患者の原文）は除いて確認
      expect(it.text.replace(/「[^」]*」/g, "")).not.toMatch(/改善|悪化|正常|異常|Grade|グレード|診断|原因/);
    }
    expect(items.find((i) => i.text.startsWith("期間内に初めて記録された症状：手足のしびれ"))?.text).toContain("1/4");
    expect(items.some((i) => i.section === "患者からの質問" && i.text.includes("「しびれは治療が終わったら戻りますか？」"))).toBe(true);
    expect(items.some((i) => i.text.includes("だるさ・倦怠感は") && i.text.includes("回答がありません（欠測）"))).toBe(true);

    // 指定期間（2 日前〜今日）: 3 日前の記録は含まない
    const today = localDay(new Date());
    const from = localDay(new Date(Date.now() - 2 * 86400_000));
    const narrow = (await body(await intervisitRoute(req(staff, undefined, `http://localhost:3000/x?from=${from}&to=${today}`), ctx("id", sessionId)))).json.intervisit;
    expect(narrow.period).toMatchObject({ from, to: today, label: "指定期間", days: 3 });
    expect(narrow.vitals.recordCount).toBe(1);

    // 当事者でない医療者・終了後は拒否
    expect((await intervisitRoute(req(await loginHeaders(DR_KOBAYASHI)), ctx("id", sessionId))).status).toBe(403);
    await endRoute(req(pb, {}), ctx("id", sessionId));
    expect((await intervisitRoute(req(staff), ctx("id", sessionId))).status).toBe(403);
  });
});
