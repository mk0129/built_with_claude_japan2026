import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupPanel } from "@/components/SignupPanel";
import { SwitchNote } from "@/components/SwitchNote";
import { getPageUser } from "@/server/auth/session";
import { ShioriLogo } from "@/concept-d/ShioriLogo";

/** 患者の新規登録。ログイン済みの患者はホームへ。医療者としてログイン中なら、その旨を出してから登録できる（登録時に切り替わる） */
export default async function PatientSignupPage() {
  const u = await getPageUser();
  if (u?.kind === "patient") redirect("/home");
  return (
    <main className="au-stage">
      <div className="au-column">
        <Link href="/" className="au-back">
          ← 入口へ
        </Link>
        <ShioriLogo />
        <header className="au-head">
          <p className="eyebrow">FOR PATIENTS</p>
          <h1>はじめての方の登録</h1>
          <p>メールアドレスだけで登録できます。届いた教材を学び、体調や聞きたいことを残して、次の診察につなげましょう。</p>
        </header>
        {u && <SwitchNote name={u.name} current="医療者" />}
        <SignupPanel switching={!!u} />
        <p className="au-note">医療者のアカウントは、ご所属の医療機関が発行します。この画面からは登録できません。</p>
      </div>
    </main>
  );
}
