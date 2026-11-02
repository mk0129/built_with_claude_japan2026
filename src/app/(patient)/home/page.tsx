import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PatientHome() {
  const u = await requirePageUser("patient");
  return (
    <main className="relative space-y-5">
      <div className="blob bg-wakakusa w-56 h-56 -top-16 -right-20" />
      <header className="relative flex items-start justify-between">
        <div>
          <p className="text-ink-soft">こんにちは、</p>
          <h1 className="text-2xl font-bold">{u.name} さん</h1>
        </div>
        <SignOutButton to="/login" />
      </header>

      <section className="card space-y-2 relative">
        <h2 className="font-bold">届いたしおり</h2>
        <p className="text-ink-soft">まだ届いていません。診察のときに医療者から届きます。</p>
        <p className="text-sm text-ink-muted">（Day 2 で宿題セットと学習の続きを表示します）</p>
      </section>

      <Link href="/share" className="btn btn-primary btn-block">
        医療者に共有する（QR を表示）
      </Link>

      <section className="card space-y-1">
        <h2 className="font-bold">このアプリについて</h2>
        <p className="text-sm text-ink-soft">
          ここに届く情報は医療者が確認したものです。質問は次の診察で確認されます。緊急のときは病院の連絡先へご連絡ください。
        </p>
      </section>
    </main>
  );
}
