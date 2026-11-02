import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { claudeConfigured } from "@/server/services/claude";

/** 教材生成の設定状況（キーの値は返さない） */
export const GET = route(async (req: Request) => {
  await requireStaff(req.headers);
  return ok({ claudeConfigured: claudeConfigured(), model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", storage: process.env.SUPABASE_URL ? "supabase" : "local" });
});
