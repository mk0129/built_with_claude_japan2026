import { afterEach, beforeEach, describe, expect, it } from "vitest";
import handler from "../../.judge-demo/api/studio";

/**
 * 公開デモのサーバー関数: 合言葉がないと呼べない、鍵が未設定なら 503、短すぎる原資料は 400、
 * 構成案と下書きは本番と同じスキーマで返る（Claude はモックで差し替える）。
 */
type Captured = { status: number; body: unknown };
function call(method: string, body?: unknown) {
  const out: Captured = { status: 0, body: null };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(b: unknown) {
      out.body = b;
    },
    setHeader() {},
  };
  return handler({ method, body, headers: {} }, res).then(() => out);
}
const g = globalThis as { __shioriClaudeMock?: (args: { schemaName: string }) => unknown };
const longText = "ホルモン療法は女性ホルモンの働きを抑える治療です。自己判断で薬をやめないでください。".repeat(3);

describe("公開デモの Claude 関数", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.JUDGE_STUDIO_PASSCODE = "aikotoba";
    g.__shioriClaudeMock = ({ schemaName }) =>
      schemaName === "outline"
        ? {
            outlines: [{ title: "テスト案", primaryDomain: "drug_therapy", targetReader: "成人患者", learningObjectives: ["続ける理由を知る"], slideTitles: ["はじめに", "まとめ"], rationale: "原資料 1 章", sourceRefs: [{ sourceId: "judge-src", section: "1", quote: "ホルモン療法は女性ホルモンの働きを抑える治療です" }] }],
            mustCoverCandidates: [{ text: "自己判断で薬をやめない", kind: "prohibition", sourceRef: { sourceId: "judge-src", section: "2", quote: "自己判断で薬をやめないでください" } }],
            notCoveredBySource: [],
          }
        : {
            title: "テスト教材",
            summary: "要約",
            primaryDomain: "drug_therapy",
            learningObjectives: ["続ける理由を知る"],
            slides: [{ title: "はじめに", proposition: "要点", body: "本文", detail: "", sourceRefs: [{ sourceId: "judge-src", section: "1", quote: "ホルモン療法は女性ホルモンの働きを抑える治療です" }] }],
            questions: [{ stem: "問", options: ["a", "b", "c"], correctIndex: 0, explanation: "解説", relatedSlide: 1, sourceRefs: [] }],
            notCoveredBySource: [],
            coverage: [],
          };
  });
  afterEach(() => {
    process.env = { ...env };
    delete g.__shioriClaudeMock;
  });

  it("GET は設定の有無だけ返す。合言葉なしは 401、鍵がなければ 503", async () => {
    expect((await call("GET")).body).toMatchObject({ configured: true });
    expect((await call("POST", { mode: "ping" })).status).toBe(401);
    expect((await call("POST", { mode: "ping", passcode: "wrong" })).status).toBe(401);
    expect((await call("POST", { mode: "ping", passcode: "aikotoba" })).status).toBe(200);
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_FAKE;
    delete g.__shioriClaudeMock;
    expect((await call("GET")).body).toMatchObject({ configured: false });
    expect((await call("POST", { mode: "ping", passcode: "aikotoba" })).status).toBe(503);
  });

  it("短い原資料は 400。構成案と下書きは本番と同じ形で返る", async () => {
    expect((await call("POST", { mode: "outline", passcode: "aikotoba", source: { title: "t", text: "短い" } })).status).toBe(400);
    const o = await call("POST", { mode: "outline", passcode: "aikotoba", source: { title: "架空資料", text: longText } });
    expect(o.status).toBe(200);
    const ob = o.body as { outline: { outlines: unknown[]; mustCoverCandidates: unknown[] }; generator: string };
    expect(ob.generator).toBe("mock");
    expect(ob.outline.outlines).toHaveLength(1);
    expect(ob.outline.mustCoverCandidates).toHaveLength(1);
    const d = await call("POST", {
      mode: "generate",
      passcode: "aikotoba",
      source: { title: "架空資料", text: longText },
      outline: { title: "テスト案", targetReader: "成人患者", learningObjectives: ["続ける理由を知る"], slideTitles: ["はじめに", "まとめ"] },
      mustCover: [{ id: "mc1", text: "自己判断で薬をやめない", kind: "prohibition", status: "required", sourceRef: { quote: "自己判断で薬をやめないでください" } }],
    });
    expect(d.status).toBe(200);
    expect((d.body as { material: { slides: unknown[] } }).material.slides).toHaveLength(1);
    expect((await call("POST", { mode: "generate", passcode: "aikotoba", source: { title: "t", text: longText } })).status).toBe(400);
  });
});
