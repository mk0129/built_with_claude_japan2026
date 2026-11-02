import { timingSafeEqual } from "node:crypto";
import { drainJobs } from "@/server/services/ai-generation";

export const maxDuration = 300;

/**
 * 教材生成ジョブの回収・実行（Vercel Cron から 1 分ごとに呼ぶ想定）。
 * Authorization: Bearer ${CRON_SECRET} が一致しない限り何もしない。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret ?? ""}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const r = await drainJobs({ limit: 3, budgetMs: 200_000 });
  return Response.json(r);
}
