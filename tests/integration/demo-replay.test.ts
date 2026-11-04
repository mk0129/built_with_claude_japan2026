import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { healthRecords, healthSymptomEntries } from "@/server/db/schema";
import { applyReplayEdit } from "@/server/db/seed-health";
import { createJob, getJob, type MaterialOutput, type OutlineOutput } from "@/server/services/ai-generation";
import { buildIntervisit } from "@/server/services/intervisit";
import { summarizeIntervisit } from "@/server/services/intervisit-ai";
import { uploadSource, type PermissionInput } from "@/server/services/sources";
import { demoNow, replayFile } from "@/server/demo";
import { PATIENT_A, setupDb, type Seeded } from "../helpers";

/**
 * 撮影用デモ環境の「記録済みの Claude 出力の再生」。Claude は呼ばない（モックが呼ばれたら失敗）。
 * 現在の記録と一致しないとき・別の原資料のとき・本番環境では再生しない。
 */
const INTERVISIT = "docs/design/phase2/step4/replay/intervisit_replay.json";
const STUDIO = "docs/design/phase2/step5/replay/studio_replay.json";
const saved = { ...process.env };
let seeded: Seeded;
let claudeCalls = 0;
const g = globalThis as { __shioriClaudeMock?: () => Promise<unknown> };
const staff = (email: string) => ({ userId: seeded.users.get(email)!, kind: "staff" as const, name: email, email });
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const okPerm: PermissionInput = { allowStore: true, allowAi: true, allowDerive: true, allowPublish: true, allowShare: true, rightsHolder: "あおば記念病院（架空）", evidenceNote: "撮影用に独自作成した架空の資料（デモ）" };
const upload = (file: string) =>
  uploadSource(staff("nurse.tanaka@example.com"), { title: "再生テスト", filename: "h.docx", mime: DOCX_MIME, body: readFileSync(file), piiAttestedNone: true, permissions: okPerm });

beforeAll(async () => {
  Object.assign(process.env, {
    SEED_DEMO_HISTORY: "1",
    DEMO_ANCHOR: "2026-11-04T09:00:00+09:00",
    INTERVISIT_REPLAY_FILE: INTERVISIT,
    STUDIO_REPLAY_FILE: STUDIO,
    AI_JOBS_INLINE: "1",
    PRIVATE_STORAGE_ROOT: `${tmpdir()}/shiori-test-replay-${process.pid}`,
  });
  seeded = await setupDb();
});
afterAll(() => {
  for (const k of ["SEED_DEMO_HISTORY", "DEMO_ANCHOR", "INTERVISIT_REPLAY_FILE", "STUDIO_REPLAY_FILE", "AI_JOBS_INLINE", "PRIVATE_STORAGE_ROOT", "APP_ENV"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  delete g.__shioriClaudeMock;
});
beforeEach(() => {
  claudeCalls = 0;
  g.__shioriClaudeMock = async () => {
    claudeCalls++;
    throw new Error("再生モードで Claude が呼ばれた");
  };
});

describe("外来間要約の再生", () => {
  it("記録時と同じ記録（シードで再現）なら、18 項目すべてを現在の ID に対応づけて検証し、再生として表示する（Claude は呼ばない）", async () => {
    const patientId = seeded.users.get(PATIENT_A)!;
    const iv = await buildIntervisit({ patientId });
    const r = await summarizeIntervisit(iv, { sessionId: "replay-1", fictional: true });
    expect(r.status).toBe("ai");
    expect(r.generator).toBe("replay");
    expect(r.replayOf).toBe("2026-11-04");
    expect(r.items).toHaveLength(18);
    const ids = new Set(iv.events.map((e) => e.id));
    for (const it of r.items) {
      expect(it.sourceIds.length).toBeGreaterThan(0);
      for (const s of it.sourceIds) expect(s.startsWith("stat:") || ids.has(s)).toBe(true);
    }
    expect(claudeCalls).toBe(0);
  });

  it("記録が変わったら、矛盾する内容を出さないよう再生せずルールベースの要約にする", async () => {
    const patientId = seeded.users.get(PATIENT_A)!;
    const [last] = await getDb().select({ id: healthRecords.id }).from(healthRecords).where(eq(healthRecords.patientId, patientId)).orderBy(desc(healthRecords.measuredAt)).limit(1);
    const where = and(eq(healthSymptomEntries.recordId, last.id), eq(healthSymptomEntries.symptomKey, "numbness"));
    await getDb().update(healthSymptomEntries).set({ severity: 3 }).where(where);
    try {
      const r = await summarizeIntervisit(await buildIntervisit({ patientId }), { sessionId: "replay-2", fictional: true });
      expect(r.status).toBe("fallback");
      expect(r.generator).toBe("rule");
      expect(r.fallbackReason).toContain("一致しない");
      expect(claudeCalls).toBe(0);
    } finally {
      await applyReplayEdit(getDb(), patientId);
    }
  });

  it("架空患者以外は再生もしない", async () => {
    const iv = await buildIntervisit({ patientId: seeded.users.get(PATIENT_A)! });
    expect((await summarizeIntervisit(iv, { sessionId: "replay-3", fictional: false })).status).toBe("fallback");
    expect(claudeCalls).toBe(0);
  });
});

describe("教材生成の再生", () => {
  it("記録時と同じ原資料なら構成案と案 1 の下書きを再生し、引用元を今回の資料 ID に置き換える（Claude は呼ばない）", async () => {
    const tanaka = staff("nurse.tanaka@example.com");
    const file = JSON.parse(readFileSync(STUDIO, "utf8"));
    const src = await upload(file.sourceFixture);
    const o = await createJob(tanaka, null, { mode: "outline", sourceIds: [src.sourceId] });
    const oj = await getJob(tanaka, o.jobId);
    expect(oj.status).toBe("succeeded");
    expect(oj.generator).toBe("replay");
    const outlines = (oj.outputPayload as OutlineOutput).outlines;
    expect(outlines.map((x) => x.title)).toEqual(file.outline.outlines.map((x: { title: string }) => x.title));
    expect(outlines.flatMap((x) => x.sourceRefs.map((s) => s.sourceId)).every((s) => s === src.sourceId)).toBe(true);

    const gj = await getJob(tanaka, (await createJob(tanaka, null, { mode: "generate", sourceIds: [src.sourceId], fromJobId: o.jobId, outlineIndex: 0 })).jobId);
    expect(gj.status).toBe("succeeded");
    const m = gj.outputPayload as MaterialOutput;
    expect(m.title).toBe(file.material.title);
    expect(m.slides.map((s) => s.body)).toEqual(file.material.slides.map((s: { body: string }) => s.body));
    expect(m.slides.flatMap((s) => s.sourceRefs.map((r) => r.sourceId)).every((s) => s === src.sourceId)).toBe(true);

    // 記録していない案 2 からは作らない
    const other = await getJob(tanaka, (await createJob(tanaka, null, { mode: "generate", sourceIds: [src.sourceId], fromJobId: o.jobId, outlineIndex: 1 })).jobId);
    expect(other.status).not.toBe("succeeded");
    expect(claudeCalls).toBe(0);
  });

  it("記録時と異なる原資料では再生しない", async () => {
    const tanaka = staff("nurse.tanaka@example.com");
    const src = await upload("tests/fixtures/sources/hormone_therapy_demo.docx");
    const oj = await getJob(tanaka, (await createJob(tanaka, null, { mode: "outline", sourceIds: [src.sourceId] })).jobId);
    expect(oj.status).not.toBe("succeeded");
    expect(oj.errorMessage).toContain("異なる資料");
    expect(claudeCalls).toBe(0);
  });
});

describe("本番環境では無効", () => {
  it("APP_ENV=production では再生ファイルも基準日も使わない", () => {
    process.env.APP_ENV = "production";
    try {
      expect(replayFile("INTERVISIT_REPLAY_FILE")).toBeNull();
      expect(replayFile("STUDIO_REPLAY_FILE")).toBeNull();
      expect(Math.abs(demoNow().getTime() - Date.now())).toBeLessThan(5000);
    } finally {
      delete process.env.APP_ENV;
    }
  });
});
