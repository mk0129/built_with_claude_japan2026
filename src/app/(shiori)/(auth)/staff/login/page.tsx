import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/LoginPanel";
import { getPageUser } from "@/server/auth/session";
import { SwitchNote } from "@/components/SwitchNote";

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const u = await getPageUser();
  const { returnTo } = await searchParams;
  const safeReturn = returnTo && returnTo.startsWith("/") ? returnTo : "/staff";
  if (u?.kind === "staff") redirect(safeReturn);
  return (
    <main className="max-w-md mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold">医療者ログイン</h1>
        <p className="text-ink-soft">共用端末でも、必ずご自身のアカウントでログインしてください。</p>
      </header>
      {u && <SwitchNote name={u.name} current="患者" />}
      <LoginPanel kind="staff" redirectTo={safeReturn} switching={!!u} />
    </main>
  );
}
