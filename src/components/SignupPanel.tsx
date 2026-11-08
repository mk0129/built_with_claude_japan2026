"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * 患者の新規登録（3 手順: メールと確認 → 確認コード → 表示名）。
 * 認証は既存のメール確認コード（Better Auth email OTP）をそのまま使い、コードの確認が通った時点でアカウントができる。
 * 自己登録でできるのは患者のアカウントだけ（種別 kind は既定の patient。クライアントから変更できない）。医療者のアカウントは施設が発行する。
 * switching: 医療者としてログイン中。登録の前に今のセッションを終了する
 */
export function SignupPanel({ switching = false }: { switching?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "profile">("email");
  const [email, setEmail] = useState("");
  const [agreeDemo, setAgreeDemo] = useState(false);
  const [agreeShare, setAgreeShare] = useState(false);
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function sendOtp() {
    setBusy(true);
    setMsg(null);
    const res = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (res.error) {
      setMsg(res.error.message ?? "送信できませんでした");
      return;
    }
    setStep("code");
    setMsg("確認コードを送りました（開発中はサーバーログに表示されます）");
  }

  async function verifyOtp() {
    setBusy(true);
    setMsg(null);
    if (switching) await authClient.signOut().catch(() => {});
    const res = await authClient.signIn.emailOtp({ email, otp });
    setBusy(false);
    if (res.error) {
      setMsg(res.error.message ?? "コードが正しくありません");
      return;
    }
    // すでに表示名があるアカウント（登録済み）は、そのままホームへ
    const current = res.data?.user?.name?.trim() ?? "";
    if (current && current !== email && !current.includes("@")) {
      router.push("/home");
      router.refresh();
      return;
    }
    setMsg(null);
    setStep("profile");
  }

  async function finish() {
    setBusy(true);
    setMsg(null);
    const res = await authClient.updateUser({ name: name.trim() });
    setBusy(false);
    if (res.error) {
      setMsg(res.error.message ?? "保存できませんでした");
      return;
    }
    router.push("/home");
    router.refresh();
  }

  const steps = ["メールアドレス", "確認コード", "表示名"];
  const index = step === "email" ? 0 : step === "code" ? 1 : 2;
  return (
    <div className="au-panel" data-signup>
      <ol className="au-steps" aria-label="登録の手順">
        {steps.map((label, i) => (
          <li key={label} className={i < index ? "done" : i === index ? "now" : ""} aria-current={i === index ? "step" : undefined}>
            <i>{i + 1}</i>
            {label}
          </li>
        ))}
      </ol>

      {step === "email" && (
        <section className="au-card">
          <h2>メールアドレスを入力</h2>
          <p className="au-sub">このアドレスに 6 桁の確認コードを送ります。パスワードは使いません。</p>
          <label className="au-label" htmlFor="signup-email">
            メールアドレス
          </label>
          <input id="signup-email" className="au-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-signup-email />
          <label className="au-check">
            <input type="checkbox" checked={agreeDemo} onChange={(e) => setAgreeDemo(e.target.checked)} data-signup-consent-demo />
            <span>
              これはデモ版で、扱うデータは架空です。実際の診療や、緊急時の連絡には使いません。体調が急に悪いときは、医療機関が案内する連絡先に連絡します。
            </span>
          </label>
          <label className="au-check">
            <input type="checkbox" checked={agreeShare} onChange={(e) => setAgreeShare(e.target.checked)} data-signup-consent-share />
            <span>
              学習・体調・質問の記録はこのアカウントに保存されます。医療者が見られるのは、私が承認した一時共有の間（60 分）だけで、いつでも終了できます。
            </span>
          </label>
          <button className="primary-button au-block" disabled={busy || !emailOk || !agreeDemo || !agreeShare} onClick={sendOtp} data-signup-send>
            確認コードを送る
          </button>
        </section>
      )}

      {step === "code" && (
        <section className="au-card">
          <h2>確認コードを入力</h2>
          <p className="au-sub">
            {email} に送った 6 桁のコードを入力してください（5 分間有効）。
          </p>
          <label className="au-label" htmlFor="signup-otp">
            6桁の確認コード
          </label>
          <input id="signup-otp" className="au-input au-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} data-signup-code />
          <button className="primary-button au-block" disabled={busy || otp.length !== 6} onClick={verifyOtp} data-signup-verify>
            コードを確認して登録
          </button>
          <button type="button" className="au-text-button" disabled={busy} onClick={() => { setOtp(""); setStep("email"); setMsg(null); }}>
            メールアドレスを入れ直す
          </button>
        </section>
      )}

      {step === "profile" && (
        <section className="au-card">
          <h2>表示名を決める</h2>
          <p className="au-sub">画面のあいさつと、医療者に共有したときの名前に使います。本名でなくてもかまいません。あとから変更できます。</p>
          <label className="au-label" htmlFor="signup-name">
            表示名
          </label>
          <input id="signup-name" className="au-input" autoComplete="nickname" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="例: はなこ" data-signup-name />
          <button className="primary-button au-block" disabled={busy || !name.trim()} onClick={finish} data-signup-finish>
            登録を完了してホームへ
          </button>
        </section>
      )}

      {msg && (
        <p role="status" className="au-status">
          {msg}
        </p>
      )}

      <p className="au-sub au-center">
        すでにアカウントをお持ちの方は <Link href="/login">ログイン</Link>
      </p>
    </div>
  );
}
