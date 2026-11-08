/**
 * 公開デモ用の小さなサーバー関数: 審査用デモの教材スタジオから、実際に Claude で構成案と下書きを作る。
 *
 * - 鍵はこの関数の環境変数（ANTHROPIC_API_KEY）にだけ置き、ブラウザには渡さない。
 * - 合言葉（JUDGE_STUDIO_PASSCODE）が一致したときだけ呼べる。未設定なら 503 で「使えない」と返す。
 * - 1 日の回数上限（JUDGE_STUDIO_DAILY_CAP、既定 30。インスタンス内の目安）と、原資料の長さ上限（20,000 文字）。
 * - プロンプトと出力スキーマは本番と同じ（src/server/services/ai-prompts.ts）。DB・個人情報は扱わない。
 */
import { timingSafeEqual } from "node:crypto";
import { callClaudeStructured, claudeConfigured, ClaudeError } from "../../src/server/services/claude";
import { MaterialSchema, OutlineSchema, SYSTEM, materialPrompt, outlinePrompt, type MustCoverInputItem } from "../../src/server/services/ai-prompts";
import { detectKind, detectPii, extractText } from "../../src/server/services/extract";

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (k: string, v: string) => void };

const SOURCE_ID = "judge-src";
const MAX_SOURCE_CHARS = 20000;
/** 公開デモの関数に送れるファイルの上限（Vercel の本文上限 4.5MB の内側。本番は 15MB） */
const MAX_FILE_BYTES = 3.5 * 1024 * 1024;
const counter: { day: string; count: number } = { day: "", count: 0 };

const fail = (res: Res, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function readBody(req: Req): Record<string, unknown> {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try {
      return JSON.parse(b) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return b as Record<string, unknown>;
}

function cleanText(v: unknown, max: number) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");
  // 鍵（ANTHROPIC_API_KEY）か、検証用の擬似生成（CLAUDE_FAKE=1）があり、合言葉が設定されているときだけ使える
  const ready = claudeConfigured();
  const pass = process.env.JUDGE_STUDIO_PASSCODE;
  if (req.method === "GET") {
    // 使えるかどうかだけを返す（鍵も合言葉も返さない）
    return res.status(200).json({ configured: !!(ready && pass), model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5" });
  }
  if (req.method !== "POST") return fail(res, 405, "METHOD_NOT_ALLOWED", "POST だけを受け付けます");
  if (!ready || !pass) return fail(res, 503, "NOT_CONFIGURED", "公開デモの Claude 生成は設定されていません（ANTHROPIC_API_KEY / JUDGE_STUDIO_PASSCODE）");
  const body = readBody(req);
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (!passcode || !sameSecret(passcode, pass)) return fail(res, 401, "BAD_PASSCODE", "合言葉が違います");
  const mode = body.mode;
  if (mode === "ping") return res.status(200).json({ ok: true, model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5" });
  if (mode === "extract") {
    // PDF / Word / PowerPoint / テキストから本文を取り出す（本番と同じ抽出。OCR はしない。Claude は呼ばない）
    const filename = cleanText(body.filename, 200) || "source";
    const mime = cleanText(body.mime, 100);
    const kind = detectKind(filename, mime);
    if (!kind) return fail(res, 400, "UNSUPPORTED_FILE", "PDF・Word（.docx）・PowerPoint（.pptx）・テキストに対応しています");
    const b64 = typeof body.contentBase64 === "string" ? body.contentBase64 : "";
    if (!b64 || b64.length > (MAX_FILE_BYTES * 4) / 3 + 1024) return fail(res, 413, "FILE_TOO_LARGE", "公開デモでは 3.5MB までのファイルに対応しています（本番は 15MB）");
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      return fail(res, 400, "BAD_FILE", "ファイルを読み取れませんでした");
    }
    if (buf.length === 0 || buf.length > MAX_FILE_BYTES) return fail(res, 413, "FILE_TOO_LARGE", "公開デモでは 3.5MB までのファイルに対応しています（本番は 15MB）");
    try {
      const ex = await extractText(buf, kind);
      const full = ex.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
      const text = full.slice(0, MAX_SOURCE_CHARS);
      const warnings = [...ex.warnings];
      if (full.length > MAX_SOURCE_CHARS) warnings.push(`本文が長いため先頭 ${MAX_SOURCE_CHARS.toLocaleString()} 文字だけを使います`);
      const pii = detectPii(full);
      return res.status(200).json({ kind, text, charCount: full.length, pages: ex.meta.pages ?? null, warnings, piiHints: pii });
    } catch {
      return fail(res, 400, "EXTRACT_FAILED", "ファイルから本文を取り出せませんでした（画像だけの PDF や保護された PDF は読み取れません）");
    }
  }

  // 1 日の回数上限（インスタンス内の目安。鍵側の上限と併用する）
  const today = new Date().toISOString().slice(0, 10);
  if (counter.day !== today) {
    counter.day = today;
    counter.count = 0;
  }
  const cap = Number(process.env.JUDGE_STUDIO_DAILY_CAP || 30);
  if (counter.count >= cap) return fail(res, 429, "DAILY_CAP", "本日の生成回数の上限に達しました。明日またお試しください");

  const source = (body.source ?? {}) as { title?: unknown; text?: unknown };
  const title = cleanText(source.title, 120) || "原資料";
  const text = cleanText(source.text, MAX_SOURCE_CHARS);
  if (text.length < 50) return fail(res, 400, "SOURCE_TOO_SHORT", "原資料の本文が短すぎます（50 文字以上）");
  const sources = [{ id: SOURCE_ID, title, extractedText: text }];

  try {
    if (mode === "outline") {
      counter.count += 1;
      const r = await callClaudeStructured({ system: SYSTEM, user: outlinePrompt(sources), schema: OutlineSchema, schemaName: "outline", maxTokens: 8000 });
      return res.status(200).json({ outline: r.data, model: r.model, generator: r.generator, usage: { input: r.inputTokens, output: r.outputTokens, ms: r.durationMs } });
    }
    if (mode === "generate") {
      const outline = (body.outline ?? null) as null | { title?: string; targetReader?: string; learningObjectives?: string[]; slideTitles?: string[] };
      const brief = (body.brief ?? null) as null | { theme?: string; audience?: string; objectives?: string[] };
      const rawMust = Array.isArray(body.mustCover) ? (body.mustCover as unknown[]) : [];
      const mustCover: MustCoverInputItem[] = rawMust
        .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
        .slice(0, 20)
        .map((m, i) => ({
          id: cleanText(m.id, 64) || `mc${i + 1}`,
          text: cleanText(m.text, 300),
          kind: (["emergency", "visit", "prohibition", "caution", "fact"].includes(String(m.kind)) ? String(m.kind) : "caution") as MustCoverInputItem["kind"],
          sourceRef: { sourceId: SOURCE_ID, section: cleanText((m.sourceRef as Record<string, unknown> | undefined)?.section, 120) || undefined, quote: cleanText((m.sourceRef as Record<string, unknown> | undefined)?.quote, 300) || undefined },
          status: (["required", "other_material", "needs_review"].includes(String(m.status)) ? String(m.status) : "needs_review") as MustCoverInputItem["status"],
        }))
        .filter((m) => m.text);
      const spec = outline
        ? { title: cleanText(outline.title, 120), audience: cleanText(outline.targetReader, 120), objectives: (outline.learningObjectives ?? []).map((o) => cleanText(o, 200)).filter(Boolean).slice(0, 3), slideTitles: (outline.slideTitles ?? []).map((t) => cleanText(t, 120)).filter(Boolean).slice(0, 8), mustCover }
        : { theme: cleanText(brief?.theme, 120), audience: cleanText(brief?.audience, 120), objectives: (brief?.objectives ?? []).map((o) => cleanText(o, 200)).filter(Boolean).slice(0, 3), mustCover };
      if (!outline && !spec.theme) return fail(res, 400, "SPEC_REQUIRED", "構成案かテーマを指定してください");
      counter.count += 1;
      const r = await callClaudeStructured({ system: SYSTEM, user: materialPrompt(sources, spec), schema: MaterialSchema, schemaName: "material", maxTokens: 16000 });
      return res.status(200).json({ material: r.data, model: r.model, generator: r.generator, usage: { input: r.inputTokens, output: r.outputTokens, ms: r.durationMs } });
    }
    return fail(res, 400, "BAD_MODE", "mode は outline / generate / ping のいずれかです");
  } catch (e) {
    if (e instanceof ClaudeError) return fail(res, e.code === "RATE_LIMIT" || e.code === "OVERLOADED" ? 429 : 502, e.code, e.message);
    return fail(res, 502, "API_ERROR", "Claude の呼び出しに失敗しました");
  }
}
