import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageUser } from "@/server/auth/session";
import { ShioriLogo } from "@/concept-d/ShioriLogo";

/** 入口（Concept D の配色・書体・余白）。ログイン済みなら正式 UI（患者 /home、医療者 /staff）へ */
export default async function Landing() {
  const u = await getPageUser();
  if (u) redirect(u.kind === "patient" ? "/home" : "/staff");
  return (
    <main className="au-stage">
      <div className="au-column au-entry">
        <ShioriLogo variant="entry" />
        <h1>治療の道のりを、自分のペースで。</h1>
        <p className="au-lead">医療者が選んだ説明を、読み・聞き・確かめて、次の診察につなげるためのノートです。</p>
        <div className="au-actions">
          <Link href="/login" className="primary-button au-primary" data-entry-patient>
            患者の方はこちら
          </Link>
          <Link href="/staff/login" className="au-secondary" data-entry-staff>
            医療者の方はこちら
            <small>病院・診療所のアカウントでログイン</small>
          </Link>
        </div>
        <p className="au-note">デモ版です。架空の患者・医療機関のデータだけを扱い、実際の診療には使用しません。</p>
      </div>
    </main>
  );
}
