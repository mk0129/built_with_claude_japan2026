import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageUser } from "@/server/auth/session";

const APP = process.env.NEXT_PUBLIC_APP_NAME ?? "しおり（仮）";

/** 入口。ログイン済みなら正式 UI（患者 /home、医療者 /staff）へ。Figma Make に入口画面のデザインがないため、未ログイン時は従来の入口を使う */
export default async function Landing() {
  const u = await getPageUser();
  if (u) redirect(u.kind === "patient" ? "/home" : "/staff");
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-10 overflow-hidden">
      <div className="blob bg-sakura w-72 h-72 -top-10 -left-16" />
      <div className="blob bg-sora w-80 h-80 -bottom-20 -right-20" />
      <div className="relative w-full max-w-md space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-wide">{APP}</h1>
          <p className="text-ink-soft">
            医療者が選んだ情報を、あなたのペースで読み・聞き・確かめる。
          </p>
        </header>
        <div className="card space-y-3">
          <Link href="/login" className="btn btn-primary btn-block">
            患者の方はこちら
          </Link>
          <Link href="/staff/login" className="btn btn-block">
            医療者の方はこちら
          </Link>
        </div>
        <p className="text-sm text-ink-muted text-center">
          ハッカソン用 MVP。架空の患者・医療機関のみを扱い、実際の診療には使用しません。
        </p>
      </div>
    </main>
  );
}
