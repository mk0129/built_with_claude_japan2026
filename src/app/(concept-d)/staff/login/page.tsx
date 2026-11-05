import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/LoginPanel";
import { getPageUser } from "@/server/auth/session";
import { SwitchNote } from "@/components/SwitchNote";
import { ShioriLogo } from "@/concept-d/ShioriLogo";

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const u = await getPageUser();
  const { returnTo } = await searchParams;
  const safeReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/staff";
  if (u?.kind === "staff") redirect(safeReturn);
  return (
    <main className="au-stage au-staff">
      <div className="au-column">
        <Link href="/" className="au-back">
          ← 入口へ
        </Link>
        <ShioriLogo sub="for medical" />
        <header className="au-head">
          <p className="eyebrow">FOR MEDICAL STAFF</p>
          <h1>医療者ログイン</h1>
          <p>共用端末でも、必ずご自身のアカウントでログインしてください。</p>
        </header>
        {u && <SwitchNote name={u.name} current="患者" />}
        <LoginPanel kind="staff" redirectTo={safeReturn} switching={!!u} />
        <Link href="/login" className="au-switch-link">
          患者の方のログインはこちら
        </Link>
      </div>
    </main>
  );
}
