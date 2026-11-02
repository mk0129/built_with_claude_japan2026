"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api, errorText } from "@/lib/api";

type DemoAccount = { email: string; name: string; kind: "patient" | "staff"; label: string };

export function LoginPanel({ kind, redirectTo }: { kind: "patient" | "staff"; redirectTo: string }) {
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
    <div className="space-y-5">
      {demo && demo.length > 0 && (
        <section className="card space-y-3 border-dashed">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">デモ用アカウント</h2>
            <span className="pill">架空データ</span>
          </div>
          <div className="grid gap-2">
            {demo.map((a) => (
              <button key={a.email} className="btn btn-soft justify-between" disabled={busy} onClick={() => demoLogin(a)}>
                <span>{a.name}</span>
                <span className="text-sm font-normal text-ink-soft">{a.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-bold">メールアドレスでログイン</h2>
        <label className="label" htmlFor="email">
          メールアドレス
        </label>
        <input id="email" className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {!otpSent ? (
          <button className="btn btn-block" disabled={busy || !email} onClick={sendOtp}>
            確認コードを送る
          </button>
        ) : (
          <>
            <label className="label" htmlFor="otp">
              6桁の確認コード
            </label>
            <input id="otp" className="input code-display text-center" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} />
            <button className="btn btn-primary btn-block" disabled={busy || otp.length !== 6} onClick={verifyOtp}>
              ログイン
            </button>
          </>
        )}
      </section>

      <section className="card space-y-3">
        <button className="btn btn-block" onClick={google}>
          Google でログイン
        </button>
        {kind === "patient" && (
          <button className="btn btn-block" disabled title="LINE ログインは外部設定後に有効になります">
            LINE でログイン（準備中）
          </button>
        )}
      </section>

      {msg && (
        <p role="status" className="text-sm text-ink-soft">
          {msg}
        </p>
      )}
    </div>
  );
}
