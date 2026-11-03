import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/LoginPanel";
import { getPageUser } from "@/server/auth/session";

export default async function PatientLoginPage() {
  const u = await getPageUser();
  if (u) redirect(u.kind === "patient" ? "/home" : "/staff");
  return (
    <main className="space-y-6">
      <header className="space-y-1">
        <Link href="/" className="text-sm text-ink-muted">
          ← トップへ
        </Link>
        <h1 className="text-2xl font-bold">ログイン</h1>
        <p className="text-ink-soft">学習の記録はあなたのアカウントに保存され、病院が変わっても引き継がれます。</p>
      </header>
      <LoginPanel kind="patient" redirectTo="/home" />
    </main>
  );
}
