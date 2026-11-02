"use client";
import { useCallback, useState } from "react";
import { useNow } from "@/lib/use-now";
import QRCode from "qrcode";
import { ApiError, api, errorText } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";

type Grant = {
  grantId: string;
  token?: string;
  code: string;
  expiresAt: string;
  qrUrl?: string;
};
type GrantStatus = {
  grantId: string;
  decision: "pending" | "approved" | "denied" | "expired";
  expiresAt: string;
  claimed: null | { orgName: string; clinicianName: string; claimedAt: string };
  consultationSessionId: string | null;
};
type Consultation = {
  id: string;
  orgName: string;
  clinicianName: string;
  expiresAt: string;
  active: boolean;
  remainingSec: number;
  endedBy: string | null;
  pendingExtension: { id: string } | null;
};
type SessionRow = { id: string; orgName: string; startedAt: string; endedAt: string | null; active: boolean };

function fmtRemain(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ShareClient() {
  const [grant, setGrant] = useState<Grant | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualSessionId, setManualSessionId] = useState<string | null>(null);
  const [closedSessionIds, setClosedSessionIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const now = useNow();

  // 有効なセッションがあればそれを優先表示（承認直後・一覧・手動の順に導出。effect での setState は避ける）
  const sessions = usePoll<{ sessions: SessionRow[] }>(() => api("/api/v1/sessions/mine"), 5000);

  const issue = useCallback(async () => {
    setErr(null);
    try {
      const g = await api<Grant>("/api/v1/qr", { json: {} });
      setGrant(g);
      setQrDataUrl(await QRCode.toDataURL(g.qrUrl!, { width: 320, margin: 1, color: { dark: "#2f3a56", light: "#ffffff" } }));
    } catch (e) {
      setErr(errorText(e));
    }
  }, []);

  const status = usePoll<GrantStatus>(grant && !manualSessionId ? () => api(`/api/v1/qr/${grant.grantId}`) : null, 2000, [grant?.grantId, manualSessionId]);
  const approvedSessionId = status.data?.decision === "approved" ? status.data.consultationSessionId : null;
  const activeFromList = sessions.data?.sessions.find((s) => s.active)?.id ?? null;
  const candidate = manualSessionId ?? approvedSessionId ?? activeFromList;
  const sessionId = candidate && !closedSessionIds.includes(candidate) ? candidate : null;
  const consult = usePoll<Consultation>(sessionId ? () => api(`/api/v1/consultations/${sessionId}`) : null, 3000, [sessionId]);

  function closeSession() {
    if (sessionId) setClosedSessionIds((ids) => [...ids, sessionId]);
    setManualSessionId(null);
    setGrant(null);
    setQrDataUrl(null);
  }

  async function decide(approve: boolean) {
    if (!grant) return;
    setErr(null);
    try {
      if (approve) {
        const r = await api<{ consultationSessionId: string }>(`/api/v1/qr/${grant.grantId}/approve`, { json: {} });
        setManualSessionId(r.consultationSessionId);
      } else {
        await api(`/api/v1/qr/${grant.grantId}/deny`, { json: {} });
        setGrant(null);
        setQrDataUrl(null);
      }
    } catch (e) {
      setErr(errorText(e));
    }
  }

  /**
   * 共有の終了（UX-10）。二度押しを防ぎ、医療者側が先に終了していた場合（SESSION_NOT_ACTIVE）も終了扱いにする。
   * 一覧を null に戻すと次のポーリングまで「確認しています…」になるため、該当セッションだけを終了済みに書き換えて QR ボタンを即時に出す。
   */
  async function endSession() {
    if (!sessionId || ending) return;
    const id = sessionId;
    setEnding(true);
    setErr(null);
    try {
      await api(`/api/v1/consultations/${id}/end`, { json: {} });
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "SESSION_NOT_ACTIVE")) {
        setErr(errorText(e));
        setEnding(false);
        return;
      }
    }
    sessions.setData((d) => (d ? { sessions: d.sessions.map((s) => (s.id === id ? { ...s, active: false, endedAt: new Date().toISOString() } : s)) } : d));
    closeSession();
    setEnding(false);
  }

  async function decideExtension(approve: boolean) {
    if (!sessionId) return;
    await api(`/api/v1/consultations/${sessionId}/extend/decide`, { json: { approve } });
  }

  // ---- 診察セッション中 ----
  if (sessionId) {
    const c = consult.data;
    if (c && !c.active) {
      return (
        <section className="card space-y-3">
          <h2 className="font-bold">共有は終了しました</h2>
          <p className="text-ink-soft">{c.endedBy === "clinician" ? "医療者が終了しました。" : c.endedBy === "patient" ? "あなたが終了しました。" : "時間になったため終了しました。"}</p>
          <button className="btn btn-block" onClick={closeSession}>
            閉じる
          </button>
        </section>
      );
    }
    const remain = c ? Math.max(0, Math.floor((new Date(c.expiresAt).getTime() - now) / 1000)) : 0;
    return (
      <section className="card space-y-4 border-2 border-wakakusa">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">共有中</h2>
          <span className="pill bg-wakakusa">残り {fmtRemain(remain)}</span>
        </div>
        {c && (
          <p className="text-ink-soft">
            {c.orgName} の {c.clinicianName} があなたの記録を見ています。
          </p>
        )}
        {c?.pendingExtension && (
          <div className="rounded-xl bg-sora p-3 space-y-2">
            <p className="font-bold">医療者が共有時間の延長（60分）を求めています。</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-primary" onClick={() => decideExtension(true)}>
                延長を許可
              </button>
              <button className="btn" onClick={() => decideExtension(false)}>
                許可しない
              </button>
            </div>
          </div>
        )}
        <button className="btn btn-danger btn-block" onClick={endSession} disabled={ending} aria-busy={ending}>
          {ending ? "終了しています…" : "共有を終了する"}
        </button>
        {err && <p className="text-danger text-sm">{err}</p>}
        <p className="text-sm text-ink-muted">終了すると医療者はそれ以上あなたの記録を見られません。次の診察ではもう一度 QR を見せてください。</p>
      </section>
    );
  }

  // ---- 承認待ち ----
  if (grant && status.data?.decision === "pending" && status.data.claimed) {
    const c = status.data.claimed;
    return (
      <section className="card space-y-4 border-2 border-sakura-deep" role="alertdialog" aria-labelledby="approve-title">
        <h2 id="approve-title" className="font-bold text-lg">記録の共有を許可しますか？</h2>
        <dl className="space-y-2">
          <div><dt className="text-sm text-ink-soft">医療機関</dt><dd className="font-bold text-lg">{c.orgName}</dd></div>
          <div><dt className="text-sm text-ink-soft">医療者</dt><dd className="font-bold text-lg">{c.clinicianName}</dd></div>
          <div><dt className="text-sm text-ink-soft">共有する内容</dt><dd>学習の記録・質問・これまでの処方（他の病院の分も含みます）</dd></div>
          <div><dt className="text-sm text-ink-soft">共有する時間</dt><dd>60分（いつでも終了できます）</dd></div>
        </dl>
        <div className="grid gap-2">
          <button className="btn btn-primary btn-block" onClick={() => decide(true)}>
            許可する
          </button>
          <button className="btn btn-block" onClick={() => decide(false)}>
            許可しない
          </button>
        </div>
        {err && <p className="text-danger text-sm">{err}</p>}
      </section>
    );
  }

  // ---- 読み込み中（共有中のセッションがあるか確認するまで QR ボタンを出さない） ----
  if (!sessions.data && !sessions.error && !grant) {
    return (
      <section className="card text-center text-ink-soft" aria-busy>
        確認しています…
      </section>
    );
  }

  // ---- QR 表示 ----
  const expired = grant ? new Date(grant.expiresAt).getTime() <= now || status.data?.decision === "expired" : false;
  const denied = status.data?.decision === "denied";
  return (
    <section className="card space-y-4 text-center">
      {!grant || expired || denied ? (
        <>
          {expired && <p className="text-ink-soft">QR コードの有効期限（5分）が切れました。</p>}
          {denied && <p className="text-ink-soft">共有を許可しませんでした。</p>}
          <button className="btn btn-primary btn-block" onClick={issue}>
            {grant ? "もう一度 QR を表示する" : "QR コードを表示する"}
          </button>
        </>
      ) : (
        <>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="医療者に見せる QR コード" className="mx-auto w-64 h-64 rounded-xl border border-line" />
          )}
          <div>
            <p className="label">QR が読めないときは、この番号を伝えてください</p>
            <p className="code-display" aria-label={`番号 ${grant.code.split("").join(" ")}`}>
              {grant.code}
            </p>
          </div>
          <p className="pill">残り {fmtRemain(Math.max(0, Math.floor((new Date(grant.expiresAt).getTime() - now) / 1000)))}</p>
          <p className="text-sm text-ink-muted">医療者が読み取ると、この画面に確認が表示されます。</p>
        </>
      )}
      {err && <p className="text-danger text-sm">{err}</p>}
      {sessions.data && sessions.data.sessions.length > 0 && (
        <details className="text-left">
          <summary className="text-sm text-ink-soft cursor-pointer">共有の履歴</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {sessions.data.sessions.map((s) => (
              <li key={s.id} className="flex justify-between">
                <span>{s.orgName}</span>
                <span className="text-ink-muted">{new Date(s.startedAt).toLocaleString("ja-JP")}{s.active ? "（共有中）" : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
