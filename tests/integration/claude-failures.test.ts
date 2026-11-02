import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { aiGenerationJobs } from "@/server/db/schema";
import { ClaudeError, callClaudeStructured } from "@/server/services/claude";
import { createJob, drainJobs, getJob, type MaterialOutput } from "@/server/services/ai-generation";
import { uploadSource, type PermissionInput } from "@/server/services/sources";
import { setupDb, type Seeded } from "../helpers";

/**
 * 実 SDK の経路（ストリーミング）を、ローカルの擬似 API サーバーに向けて障害を再現する。外部には送信しない。
 */
let server: Server;
let behavior: "hang" | "529" | "401" | "500" = "hang";
const g = globalThis as { __shioriClaudeMock?: unknown };

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    if (behavior === "hang") return; // 応答しない → タイムアウト
    const status = Number(behavior);
    res.writeHead(status, { "content-type": "application/json", "request-id": "req_local_test" });
    res.end(JSON.stringify({ type: "error", error: { type: status === 529 ? "overloaded_error" : status === 401 ? "authentication_error" : "api_error", message: "test" } }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
});
afterAll(() => {
  server.close();
});

async function callReal() {
  const saved = { ...process.env };
  const mock = g.__shioriClaudeMock;
  delete g.__shioriClaudeMock;
  const addr = server.address() as { port: number };
  Object.assign(process.env, { ANTHROPIC_API_KEY: "test-key-not-real", ANTHROPIC_BASE_URL: `http://127.0.0.1:${addr.port}`, CLAUDE_TIMEOUT_MS: "400", CLAUDE_MAX_RETRIES: "0" });
  try {
    await callClaudeStructured({ system: "s", user: "u", schema: z.object({ a: z.string() }), schemaName: "t" });
    return null;
  } catch (e) {
    return e as ClaudeError;
  } finally {
    for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "CLAUDE_TIMEOUT_MS", "CLAUDE_MAX_RETRIES"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    g.__shioriClaudeMock = mock;
  }
}

describe("Claude API 障害の分類（実 SDK 経路）", () => {
  it("応答がないとタイムアウト（再試行可能）", async () => {
    behavior = "hang";
    const e = await callReal();
    expect(e).toBeInstanceOf(ClaudeError);
    expect(e!.code).toBe("TIMEOUT");
    expect(e!.retryable).toBe(true);
  });
  it("529 は混雑（再試行可能）、401 は認証失敗（再試行しない）、500 はサーバーエラー", async () => {
    behavior = "529";
    expect((await callReal())!.code).toBe("OVERLOADED");
    behavior = "401";
    const auth = (await callReal())!;
    expect(auth.code).toBe("AUTH");
    expect(auth.retryable).toBe(false);
    expect(auth.message).not.toContain("test-key-not-real");
    behavior = "500";
    expect((await callReal())!.code).toBe("SERVER_ERROR");
  });
});

describe("永続ジョブ（自動再試行・リース回収・上限）", () => {
  let seeded: Seeded;
  let sourceId: string;
  const DOCX = readFileSync("tests/fixtures/sources/hormone_therapy_demo.docx");
  const perm: PermissionInput = { allowStore: true, allowAi: true, allowDerive: true, allowPublish: true, allowShare: true, rightsHolder: "架空", evidenceNote: "デモ" };
  const staff = () => ({ userId: seeded.users.get("nurse.tanaka@example.com")!, kind: "staff" as const, name: "t", email: "nurse.tanaka@example.com" });
  const sid = (u: string) => u.match(/<source id="([^"]+)"/)![1];
  const material = (s: string): MaterialOutput => ({
    title: "t",
    summary: "s",
    primaryDomain: "drug_therapy",
    learningObjectives: ["x"],
    slides: [1, 2, 3].map((i) => ({ title: `s${i}`, proposition: "p", body: "b", detail: "", sourceRefs: [{ sourceId: s, section: "", quote: "5年以上の長い期間続けることが多い治療です" }] })),
    questions: [1, 2].map((i) => ({ stem: `q${i}`, options: ["a", "b", "c"], correctIndex: 0, explanation: "e", relatedSlide: 1, sourceRefs: [{ sourceId: s, section: "", quote: "5年以上の長い期間続けることが多い治療です" }] })),
    notCoveredBySource: [],
  });

  beforeAll(async () => {
    process.env.AI_JOBS_INLINE = "1";
    process.env.PRIVATE_STORAGE_ROOT = `${tmpdir()}/shiori-test-storage-f-${process.pid}`;
    seeded = await setupDb();
    sourceId = (await uploadSource(staff(), { title: "f", filename: "f.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", body: DOCX, piiAttestedNone: true, permissions: perm })).sourceId;
  });

  it("一時的な障害は自動再試行を予約し、cron の回収で成功する。生成元を記録する", async () => {
    let calls = 0;
    g.__shioriClaudeMock = async ({ user }: { user: string }) => {
      calls++;
      if (calls === 1) throw new ClaudeError("OVERLOADED", "混雑");
      return material(sid(user));
    };
    const { jobId } = await createJob(staff(), null, { mode: "freeform", sourceIds: [sourceId], theme: "x", objectives: [] });
    let j = await getJob(staff(), jobId);
    expect(j.status).toBe("queued");
    expect(j.errorCode).toBe("OVERLOADED");
    expect(j.attempt).toBe(2);
    expect(j.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    // 予約時刻前は拾わない
    expect((await drainJobs()).processed).not.toContain(jobId);
    await getDb().update(aiGenerationJobs).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(aiGenerationJobs.id, jobId));
    expect((await drainJobs()).processed).toContain(jobId);
    j = await getJob(staff(), jobId);
    expect(j.status).toBe("succeeded");
    expect(j.generator).toBe("mock");
    expect(j.model).toMatch(/^mock:/);
    expect(j.durationMs).not.toBeNull();
  });

  it("実行中のまま止まったジョブ（関数の打ち切り）はリース切れで回収し、上限を超えたら失敗にする", async () => {
    g.__shioriClaudeMock = async ({ user }: { user: string }) => material(sid(user));
    const { jobId } = await createJob(staff(), null, { mode: "freeform", sourceIds: [sourceId], theme: "x", objectives: [] });
    // 途中で止まった状態を再現
    await getDb().update(aiGenerationJobs).set({ status: "running", attempt: 1, leaseExpiresAt: new Date(Date.now() - 1000), outputVersionId: null }).where(eq(aiGenerationJobs.id, jobId));
    await drainJobs();
    let j = await getJob(staff(), jobId);
    expect(j.status).toBe("succeeded");
    expect(j.attempt).toBe(2);
    // リース内の実行中ジョブは拾わない（二重実行しない）
    await getDb().update(aiGenerationJobs).set({ status: "running", leaseExpiresAt: new Date(Date.now() + 60_000) }).where(eq(aiGenerationJobs.id, jobId));
    expect((await drainJobs()).processed).not.toContain(jobId);
    // 上限到達後のリース切れは失敗
    await getDb().update(aiGenerationJobs).set({ status: "running", attempt: 3, maxAttempts: 3, leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(aiGenerationJobs.id, jobId));
    await drainJobs();
    j = await getJob(staff(), jobId);
    expect(j.status).toBe("failed");
    expect(j.errorCode).toBe("TIMEOUT");
  });

  it("認証失敗などの恒久的な障害は自動再試行しない", async () => {
    g.__shioriClaudeMock = async () => {
      throw new ClaudeError("AUTH", "認証失敗");
    };
    const { jobId } = await createJob(staff(), null, { mode: "outline", sourceIds: [sourceId] });
    const j = await getJob(staff(), jobId);
    expect(j.status).toBe("failed");
    expect(j.errorCode).toBe("AUTH");
  });
});
