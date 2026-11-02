import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { fakeEnabled, fakeGenerate } from "./claude-fake";

/**
 * Claude 呼び出し（サーバー専用）。
 * - モデルは CLAUDE_MODEL（既定 claude-sonnet-5-5）。高精度が必要なときは CLAUDE_MODEL_HIGH
 * - 構造化出力（zod）で JSON を受け取り、安全上の拒否は fallbacks: "default" で再試行（サーバー側）
 * - テストでは globalThis.__shioriClaudeMock に差し替える（外部送信しない）
 */
export type ClaudeResult<T> = { data: T; model: string; inputTokens: number; outputTokens: number };
type Mock = (args: { system: string; user: string; schemaName: string }) => Promise<unknown>;

export class ClaudeError extends Error {
  constructor(
    public code: "NO_API_KEY" | "REFUSAL" | "MAX_TOKENS" | "PARSE_FAILED" | "API_ERROR",
    message: string,
  ) {
    super(message);
  }
}

export function claudeConfigured() {
  return !!(globalThis as { __shioriClaudeMock?: Mock }).__shioriClaudeMock || !!process.env.ANTHROPIC_API_KEY || fakeEnabled();
}

export async function callClaudeStructured<S extends z.ZodType>(args: {
  system: string;
  user: string;
  schema: S;
  schemaName: string;
  high?: boolean;
  maxTokens?: number;
}): Promise<ClaudeResult<z.infer<S>>> {
  const mock = (globalThis as { __shioriClaudeMock?: Mock }).__shioriClaudeMock;
  const model = (args.high ? process.env.CLAUDE_MODEL_HIGH : process.env.CLAUDE_MODEL) || "claude-sonnet-5-5";
  if (mock) {
    const raw = await mock({ system: args.system, user: args.user, schemaName: args.schemaName });
    return { data: args.schema.parse(raw), model: `mock:${model}`, inputTokens: 0, outputTokens: 0 };
  }
  if (!process.env.ANTHROPIC_API_KEY && fakeEnabled()) {
    return { data: args.schema.parse(fakeGenerate(args.user, args.schemaName)), model: `fake:${model}`, inputTokens: 0, outputTokens: 0 };
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new ClaudeError("NO_API_KEY", "ANTHROPIC_API_KEY が設定されていません");

  const client = new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2 });
  let res;
  try {
    res = await client.beta.messages.parse({
      model,
      max_tokens: args.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: args.system,
      messages: [{ role: "user", content: args.user }],
      output_config: { format: betaZodOutputFormat(args.schema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new ClaudeError("API_ERROR", `Claude API エラー（${e.status ?? "network"}）: ${e.message}`);
    throw e;
  }
  if (res.stop_reason === "refusal") throw new ClaudeError("REFUSAL", "Claude が生成を辞退しました。資料の内容を確認してください。");
  if (res.stop_reason === "max_tokens") throw new ClaudeError("MAX_TOKENS", "出力が上限に達しました。資料を短くするか再試行してください。");
  if (!res.parsed_output) throw new ClaudeError("PARSE_FAILED", "Claude の出力を読み取れませんでした。");
  return { data: res.parsed_output as z.infer<S>, model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}
