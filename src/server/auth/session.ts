import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type PageUser = { id: string; name: string; email: string; kind: "patient" | "staff" };

export async function getPageUser(): Promise<PageUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const kind = (session.user as { kind?: string }).kind === "staff" ? "staff" : "patient";
  return { id: session.user.id, name: session.user.name, email: session.user.email, kind };
}

/**
 * ページ用: 未ログインや種別不一致は、必要な種別のログイン画面へ。
 * 種別不一致（例: 患者としてログイン中に医療者画面）でもログイン画面へ送り、そこでアカウントを切り替えられるようにする
 * （正式 UI の Figma 版にはログアウトの操作がないため、別の種別のホームへ戻すと切り替えられなくなる）。
 */
export async function requirePageUser(kind: "patient" | "staff"): Promise<PageUser> {
  const u = await getPageUser();
  if (!u || u.kind !== kind) redirect(kind === "staff" ? "/staff/login" : "/login");
  return u;
}
