import { route, ok } from "@/server/http";
import { isDemoAuthEnabled } from "@/server/auth/auth";
import { DEMO_ACCOUNTS } from "@/server/db/seed-data";
import { notFound } from "@/server/authz/errors";

/** デモ認証が有効なときだけ、架空アカウント一覧（メールと表示名のみ）を返す */
export const GET = route(async () => {
  if (!isDemoAuthEnabled) throw notFound();
  return ok({
    accounts: DEMO_ACCOUNTS.map((a) => ({ email: a.email, name: a.name, kind: a.kind, label: a.label })),
  });
});
