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

/** ページ用: 未ログインや種別不一致はログイン画面へ */
export async function requirePageUser(kind: "patient" | "staff"): Promise<PageUser> {
  const u = await getPageUser();
  if (!u) redirect(kind === "staff" ? "/staff/login" : "/login");
  if (u.kind !== kind) redirect(u.kind === "staff" ? "/staff" : "/home");
  return u;
}
