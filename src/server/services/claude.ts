import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { fakeEnabled, fakeGenerate } from "./claude-fake";

/**
 * Claude 呼び出し（サーバー専用）。
 * - モデルは CLAUDE_MODEL（既定 claude-sonnet-5-5）。高精度が必要なときは CLAUDE_MODEL_HIGH
 * - 構造化出力（zod）をストリーミングで受け取る（長い出力でも HTTP タイムアウトしにくい）
 * - 安全上の拒否は fallbacks: "default"（サーバー側の別モデル再試行）。どのモデルが答えたかを記録する
 * - generator で「実 API / 開発用の擬似生成 / テストのモック」を必ず区別する
 * - API キーはログ・エラー文に出さない
 */
export type Generator = "claude" | "fake" | "mock";
export type ClaudeResult<T> = {
  data: T;
  generator: Generator;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  durationMs: number;
  requestId: string | null;
  stopReason: string | null;
  fallbackUsed: boolean;
};
type Mock = (args: { system: string; user: string; schemaName: string }) => Promise<unknown>;

export type ClaudeErrorCode = "NO_API_KEY" | "REFUSAL" | "MAX_TOKENS" | "PARSE_FAILED" | "TIMEOUT" | "RATE_LIMIT" | "OVERLOADED" | "SERVER_ERROR" | "CONNECTION" | "AUTH" | "BAD_REQUEST" | "API_ERROR";
const RETRYABLE: ClaudeErrorCode[] = ["TIMEOUT", "RATE_LIMIT", "OVERLOADED", "SERVER_ERROR", "CONNECTION"];

export class ClaudeError extends Error {
  /** 調査用（患者情報を含まない）: HTTP ステータスと元の例外のクラス名 */
  public httpStatus: number | null = null;
  public cause_: string | null = null;
  constructor(
    public code: ClaudeErrorCode,
    message: string,
    public requestId: string | null = null,
  ) {
    super(message);
  }
  get retryable() {
    return RETRYABLE.includes(this.code);
  }
}

export function claudeMode(): Generator | null {
  if ((globalThis as { __shioriClaudeMock?: Mock }).__shioriClaudeMock) return "mock";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (fakeEnabled()) return "fake";
  return null;
}
export function claudeConfigured() {
  return claudeMode() !== null;
}

/** SDK の例外を、利用者に見せられる日本語と分類コードに変換する（キーや本文は含めない） */
export function classifyClaudeError(e: unknown): ClaudeError {
  const err = classifyInner(e);
  if (!err.cause_) err.cause_ = e instanceof Error ? e.constructor.name : typeof e;
  if (err.httpStatus == null && e instanceof Anthropic.APIError) err.httpStatus = e.status ?? null;
  return err;
}

function classifyInner(e: unknown): ClaudeError {
  if (e instanceof ClaudeError) return e;
  // 構造化出力が想定の形式（スキーマ）と一致しない（SDK の検証で失敗）
  // （SDK は「Failed to parse structured output」の AnthropicError を投げる。メッセージには出力の一部が含まれるため記録しない）
  if (e instanceof Error && (e.name === "ZodError" || /^Failed to parse structured output/.test(e.message))) return new ClaudeError("PARSE_FAILED", "Claude の出力が想定の形式と一致しませんでした。");
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ClaudeError("TIMEOUT", "Claude API の応答がタイムアウトしました。時間をおいて再試行してください。");
  if (e instanceof Anthropic.APIConnectionError) return new ClaudeError("CONNECTION", "Claude API に接続できませんでした。ネットワークを確認して再試行してください。");
  if (e instanceof Anthropic.APIError) {
    const rid = e.requestID ?? null;
    const s = e.status;
    if (s === 401 || s === 403) return new ClaudeError("AUTH", "Claude API の認証に失敗しました（API キーの設定を確認してください）。", rid);
    if (s === 429) return new ClaudeError("RATE_LIMIT", "Claude API の利用上限に達しました。少し待ってから再試行してください。", rid);
    if (s === 529) return new ClaudeError("OVERLOADED", "Claude API が混み合っています。少し待ってから再試行してください。", rid);
    if (s && s >= 500) return new ClaudeError("SERVER_ERROR", `Claude API でエラーが発生しました（${s}）。再試行してください。`, rid);
    if (s === 400 || s === 413 || s === 422) return new ClaudeError("BAD_REQUEST", `Claude API がリクエストを受け付けませんでした（${s}）。資料の長さや設定を確認してください。`, rid);
    return new ClaudeError("API_ERROR", `Claude API エラー（${s ?? "不明"}）`, rid);
  }
  return new ClaudeError("API_ERROR", "Claude API の呼び出しに失敗しました。");
}

export async function callClaudeStructured<S extends z.ZodType>(args: {
  system: string;
  user: string;
  schema: S;
  schemaName: string;
  high?: boolean;
  maxTokens?: number;
}): Promise<ClaudeResult<z.infer<S>>> {
  const model = (args.high ? process.env.CLAUDE_MODEL_HIGH : process.env.CLAUDE_MODEL) || "claude-sonnet-5-5";
  const mode = claudeMode();
  const t0 = Date.now();
  const base = { cacheReadTokens: 0, requestId: null, stopReason: null, fallbackUsed: false };
  if (mode === "mock") {
    const raw = await (globalThis as { __shioriClaudeMock?: Mock }).__shioriClaudeMock!({ system: args.system, user: args.user, schemaName: args.schemaName });
    return { ...base, data: args.schema.parse(raw), generator: "mock", model: `mock:${model}`, inputTokens: 0, outputTokens: 0, durationMs: Date.now() - t0 };
  }
  if (mode === "fake") {
    return { ...base, data: args.schema.parse(fakeGenerate(args.user, args.schemaName)), generator: "fake", model: `fake:${model}`, inputTokens: 0, outputTokens: 0, durationMs: Date.now() - t0 };
  }
  if (mode !== "claude") throw new ClaudeError("NO_API_KEY", "ANTHROPIC_API_KEY が設定されていません");
  // 実 API の呼び出し回数の上限（検証・デモの課金を抑える。CLAUDE_MAX_CALLS。プロセス内で数え、超えたら呼ばない）
  const g = globalThis as { __shioriClaudeCalls?: number };
  const maxCalls = process.env.CLAUDE_MAX_CALLS ? Number(process.env.CLAUDE_MAX_CALLS) : Infinity;
  if ((g.__shioriClaudeCalls ?? 0) >= maxCalls) throw new ClaudeError("RATE_LIMIT", "このサーバーで許可された Claude API の呼び出し回数の上限に達しました。");
  g.__shioriClaudeCalls = (g.__shioriClaudeCalls ?? 0) + 1;
  console.info(`[claude] call ${g.__shioriClaudeCalls}/${Number.isFinite(maxCalls) ? maxCalls : "∞"} schema=${args.schemaName}`);

  const client = new Anthropic({ timeout: Number(process.env.CLAUDE_TIMEOUT_MS || 300_000), maxRetries: Number(process.env.CLAUDE_MAX_RETRIES ?? 2) });
  const effort = process.env.CLAUDE_EFFORT as "low" | "medium" | "high" | undefined;
  let msg;
  let requestId: string | null = null;
  try {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: args.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: args.system,
      messages: [{ role: "user", content: args.user }],
      output_config: { format: betaZodOutputFormat(args.schema), ...(effort ? { effort } : {}) },
    });
    msg = await stream.finalMessage();
    requestId = stream.request_id ?? null;
  } catch (e) {
    throw classifyClaudeError(e);
  }
  if (msg.stop_reason === "refusal") throw new ClaudeError("REFUSAL", "Claude が生成を辞退しました。資料の内容を確認してください。", requestId);
  if (msg.stop_reason === "max_tokens") throw new ClaudeError("MAX_TOKENS", "出力が上限に達しました。資料を短くするか再試行してください。", requestId);
  if (!msg.parsed_output) throw new ClaudeError("PARSE_FAILED", "Claude の出力を読み取れませんでした。", requestId);
  const fallbackUsed = msg.content.some((b) => b.type === "fallback");
  return {
    data: msg.parsed_output as z.infer<S>,
    generator: "claude",
    model: msg.model,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
    cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
    durationMs: Date.now() - t0,
    requestId,
    stopReason: msg.stop_reason,
    fallbackUsed,
  };
}
