import { z } from "zod";
import { eq } from "drizzle-orm";
import { route, ok, parseBody } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { getDb } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { buildIntervisit } from "@/server/services/intervisit";
import { summarizeIntervisit } from "@/server/services/intervisit-ai";
import { sourceIndex } from "@/server/services/intervisit-rules";
import { claudeMode } from "@/server/services/claude";
import { audit } from "@/server/services/audit";

const Body = z.object({
  from: z.string().max(10).nullable().optional(),
  to: z.string().max(10).nullable().optional(),
  regenerate: z.boolean().optional(),
  /** 開発用の擬似生成でのみ有効: AI の失敗・検証不合格を再現する */
  simulate: z.enum(["invalid", "error"]).nullable().optional(),
});

/**
 * 医療者: 外来間の時系列要約（Claude）。有効な診察セッションがなければ 403。
 * 検証を通らない・生成できないときはルールベースの要約を返す（status: "fallback"）。エラーに患者情報は含めない。
 * 外部 AI へ送るのは架空のデモ患者（@example.com）だけ（ハッカソンの範囲。実患者は送らない）。
 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const body = await parseBody(req, Body);
  const iv = await buildIntervisit({ patientId: ctx.patientId, sessionId: ctx.sessionId, from: body.from, to: body.to });
  const [u] = await getDb().select({ email: user.email }).from(user).where(eq(user.id, ctx.patientId)).limit(1);
  const fictional = !!u?.email && u.email.toLowerCase().endsWith("@example.com");
  const simulate = body.simulate && claudeMode() !== "claude" ? body.simulate : null;
  const result = await summarizeIntervisit(iv, { sessionId: ctx.sessionId, fictional, regenerate: body.regenerate, simulate });
  await audit({
    actorUserId: ctx.clinician.userId,
    orgId: ctx.orgId,
    action: result.status === "ai" ? "patient.intervisit.ai" : "patient.intervisit.ai_fallback",
    resourceType: "patient",
    resourceId: ctx.patientId,
    consultationSessionId: ctx.sessionId,
    outcome: result.status === "ai" ? "ok" : "error",
  });
  return ok({ ...result, period: iv.period, sources: Object.fromEntries(sourceIndex(iv)) });
});
