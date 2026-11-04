import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callClaudeStructured, ClaudeError } from "@/server/services/claude";
import { buildIntervisit } from "@/server/services/intervisit";
import { summarizeIntervisit } from "@/server/services/intervisit-ai";
import { localDay } from "@/server/services/intervisit-format";
import { POST as createRecord } from "@/app/api/v1/health/records/route";
import { POST as createNote } from "@/app/api/v1/notes/route";
import { startFakeAnthropic, intervisitFromRequest } from "../fixtures/fake-anthropic.mjs";
import { DR_YAMADA, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

/**
 * 実 API と同じ受信経路の確認（Step 4 最終確認）。Anthropic SDK の実際のストリーミング受信・構造化出力の解析・サーバーの検証を、
 * ローカルの代替サーバー（tests/fixtures/fake-anthropic.mjs）で通す。外部の API は呼ばない。
 * 出力の長さ・件数の超過、HTTP エラー、出力の打ち切りが、要約全体の失敗ではなく「項目の不採用」や「分類されたエラー」になることを確かめる。
 */
type Fake = { url: string; calls: { body: { max_tokens: number; model: string } }[]; close: () => Promise<void> };
let seeded: Seeded;
let sessionId: string;
let fake: Fake;
let respond: (body: unknown) => unknown = (b) => ({ json: intervisitFromRequest(b) });
const env = { ...process.env };
const req = (headers: Headers, json: unknown) =>
  new Request("http://localhost:3000/x", { method: "POST", headers: { ...Object.fromEntries(headers.entries()), "content-type": "application/json" }, body: JSON.stringify(json) });
const jst = (daysAgo: number, hh: number) => new Date(new Date(`${localDay(new Date())}T${String(hh).padStart(2, "0")}:00:00+09:00`).getTime() - daysAgo * 86400_000).toISOString();

beforeAll(async () => {
  seeded = await setupDb();
  const pb = await loginHeaders(PATIENT_B);
  await createRecord(req(pb, { measuredAt: jst(5, 8), vitals: { temperature: 36.6 }, symptoms: [{ key: "numbness", severity: 3 }] }));
  await createRecord(req(pb, { measuredAt: jst(1, 8), vitals: { temperature: 36.8 }, symptoms: [{ key: "numbness", severity: 2 }] }));
  await createNote(req(pb, { body: "しびれは治療終了後に戻りますか？" }));
  sessionId = (await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general")).sessionId;
  void (await loginHeaders(DR_YAMADA));
  fake = (await startFakeAnthropic(((b: unknown) => respond(b)) as never)) as Fake;
  Object.assign(process.env, { ANTHROPIC_API_KEY: "test-key-not-real", ANTHROPIC_BASE_URL: fake.url, CLAUDE_MAX_RETRIES: "0", CLAUDE_FAKE: "" });
});
afterAll(async () => {
  await fake.close();
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "CLAUDE_MAX_RETRIES", "CLAUDE_FAKE"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});
const iv = () => buildIntervisit({ patientId: seeded.users.get(PATIENT_B)!, sessionId });

describe("実 API と同じ受信経路（ローカルの代替サーバー）", () => {
  it("要求の構造化データから作った応答を、SDK の解析とサーバーの検証を通して表示用の要約にする", async () => {
    respond = (b) => ({ json: intervisitFromRequest(b), model: "claude-sonnet-5-5" });
    const r = await summarizeIntervisit(await iv(), { sessionId: `${sessionId}-ok`, fictional: true });
    expect(r).toMatchObject({ status: "ai", generator: "claude", model: "claude-sonnet-5-5", rejected: [] });
    expect(r.items.some((i) => i.text.includes("「しびれは治療終了後に戻りますか？」"))).toBe(true);
    expect(r.usage!.inputTokens).toBe(1000);
    // 送った要求: 氏名・メールを含まない、max_tokens は検証の上限に足りる
    const sent = JSON.stringify(fake.calls.at(-1)!.body);
    expect(sent).not.toContain("鈴木");
    expect(sent).not.toContain("@example.com");
    expect(fake.calls.at(-1)!.body.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it("長すぎる文・多すぎる項目は、その項目だけ不採用（要約全体の例外にならない）", async () => {
    respond = (b) => {
      const base = intervisitFromRequest(b) as { items: { section: string; text: string; sourceIds: string[] }[] };
      return { json: { items: [...base.items, { ...base.items[0], text: "あ".repeat(400) }] } };
    };
    const r = await summarizeIntervisit(await iv(), { sessionId: `${sessionId}-long`, fictional: true });
    expect(r.status).toBe("ai");
    expect(r.rejected.map((x) => x.reason)).toEqual(["文が長すぎる（または空）"]);
  });

  it("以前のスキーマ（長さの上限つき）では、超えた出力で SDK の検証が失敗する — 1 回目の実画面検証の失敗の再現", async () => {
    respond = () => ({ json: { items: [{ section: "体調の変化", text: "あ".repeat(400), sourceIds: ["x"] }] } });
    const strict = z.object({ items: z.array(z.object({ section: z.string(), text: z.string().max(260), sourceIds: z.array(z.string()).max(24) })).max(28) });
    const e = await callClaudeStructured({ system: "s", user: "u", schema: strict, schemaName: "strict" }).catch((x) => x);
    expect(e).toBeInstanceOf(ClaudeError);
    expect(e.code).toBe("PARSE_FAILED");
  });

  it("HTTP エラー・出力の打ち切りは、患者情報を含まない分類とステータスで記録し、ルールベースへ切り替える", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [status, code] of [[500, "SERVER_ERROR"], [429, "RATE_LIMIT"]] as const) {
      respond = () => ({ status });
      const r = await summarizeIntervisit(await iv(), { sessionId: `${sessionId}-${status}`, fictional: true });
      expect(r.status).toBe("fallback");
      expect(r.fallbackReason).toContain(code);
      expect(warn.mock.calls.at(-1)![0]).toMatch(new RegExp(`code=${code} http=${status} .*requestId=req_fake_error`));
      expect(warn.mock.calls.at(-1)![0]).not.toContain("しびれ");
    }
    respond = (b) => ({ json: intervisitFromRequest(b), stopReason: "max_tokens" });
    const cut = await summarizeIntervisit(await iv(), { sessionId: `${sessionId}-cut`, fictional: true });
    expect(cut.fallbackReason).toContain("MAX_TOKENS");
    warn.mockRestore();
  });

  it("同時の要求は 1 回の呼び出しにまとめ、結果を再利用する", async () => {
    respond = (b) => ({ json: intervisitFromRequest(b) });
    const before = fake.calls.length;
    const data = await iv();
    const [a, b] = await Promise.all([summarizeIntervisit(data, { sessionId: `${sessionId}-dup`, fictional: true }), summarizeIntervisit(data, { sessionId: `${sessionId}-dup`, fictional: true })]);
    const c = await summarizeIntervisit(data, { sessionId: `${sessionId}-dup`, fictional: true });
    expect(fake.calls.length - before).toBe(1);
    expect(b).toEqual(a);
    expect(c.cached).toBe(true);
  });
});
