import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/LoginPanel";
import { getPageUser } from "@/server/auth/session";
import { SwitchNote } from "@/components/SwitchNote";
import { ShioriLogo } from "@/concept-d/ShioriLogo";

export default async function PatientLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const u = await getPageUser();
  const { returnTo } = await searchParams;
  // 同一サイト内の相対パスだけ（"//" で始まる外部 URL は使わない）
  const safeReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/home";
  if (u?.kind === "patient") redirect(safeReturn);
  return (
    <main className="au-stage">
      <div className="au-column">
        <Link href="/" className="au-back">
          ← 入口へ
        </Link>
        <ShioriLogo />
        <header className="au-head">
          <p className="eyebrow">FOR PATIENTS</p>
          <h1>ログイン</h1>
          <p>学習の記録はあなたのアカウントに保存され、病院が変わっても引き継がれます。</p>
        </header>
        {u && <SwitchNote name={u.name} current="医療者" />}
        <LoginPanel kind="patient" redirectTo={safeReturn} switching={!!u} />
        <Link href="/staff/login" className="au-switch-link">
          医療者の方のログインはこちら
        </Link>
      </div>
    </main>
  );
}
