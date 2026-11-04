"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api, errorText } from "@/lib/api";

type DemoAccount = { email: string; name: string; kind: "patient" | "staff"; label: string };

/** switching: 別の種別でログイン中。ログイン前に今のセッションを終了してから切り替える */
export function LoginPanel({ kind, redirectTo, switching = false }: { kind: "patient" | "staff"; redirectTo: string; switching?: boolean }) {
  const router = useRouter();
  const [demo, setDemo] = useState<DemoAccount[] | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ accounts: DemoAccount[] }>("/api/v1/demo/accounts")
      .then((r) => setDemo(r.accounts.filter((a) => a.kind === kind)))
      .catch(() => setDemo([]));
  }, [kind]);

  async function demoLogin(a: DemoAccount) {
    setBusy(true);
    setMsg(null);
    if (switching) await authClient.signOut().catch(() => {});
    const res = await authClient.signIn.email({ email: a.email, password: "shiori-demo-2026" });
    setBusy(false);
    if (res.error) {
      setMsg(res.error.message ?? "ログインできませんでした");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function sendOtp() {
    setBusy(true);
    setMsg(null);
    const res = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (res.error) {
      setMsg(res.error.message ?? "送信できませんでした");
      return;
    }
    setOtpSent(true);
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
    router.push(redirectTo);
    router.refresh();
  }

  async function google() {
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: redirectTo });
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  return (
    <div className="au-panel">
      {demo && demo.length > 0 && (
        <section className="au-card au-demo">
          <div className="au-card-head">
            <h2>デモ用アカウント</h2>
            <span className="au-tag">架空データ</span>
          </div>
          <div className="au-accounts">
            {demo.map((a) => (
              <button key={a.email} className="au-account" disabled={busy} onClick={() => demoLogin(a)}>
                <b>{a.name}</b>
                <small>{a.label}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="au-card">
        <h2>メールアドレスでログイン</h2>
        <label className="au-label" htmlFor="email">
          メールアドレス
        </label>
        <input id="email" className="au-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {!otpSent ? (
          <button className="au-button" disabled={busy || !email} onClick={sendOtp}>
            確認コードを送る
          </button>
        ) : (
          <>
            <label className="au-label" htmlFor="otp">
              6桁の確認コード
            </label>
            <input id="otp" className="au-input au-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} />
            <button className="primary-button au-block" disabled={busy || otp.length !== 6} onClick={verifyOtp}>
              ログイン
            </button>
          </>
        )}
      </section>

      <section className="au-card">
        <button className="au-button" onClick={google}>
          Google でログイン
        </button>
        {kind === "patient" && (
          <button className="au-button" disabled title="LINE ログインは外部設定後に有効になります">
            LINE でログイン（準備中）
          </button>
        )}
      </section>

      {msg && (
        <p role="status" className="au-status">
          {msg}
        </p>
      )}
    </div>
  );
}
