"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { setStoredOrgId, useStoredOrgId } from "@/lib/use-stored-org";

type Claim = { grantId: string; expiresAt: string; orgName: string };
type ClaimStatus = { grantId: string; decision: "pending" | "approved" | "denied" | "expired"; consultationSessionId: string | null };

export function extractToken(text: string): string | null {
  try {
    const u = new URL(text);
    return u.searchParams.get("t");
  } catch {
    return /^[A-Za-z0-9_-]{32,}$/.test(text) ? text : null;
  }
}

export function ScanClient({ memberships, initialToken }: { memberships: { orgId: string; orgName: string }[]; initialToken?: string }) {
  const router = useRouter();
  const stored = useStoredOrgId();
  const [orgOverride, setOrgOverride] = useState<string | null>(null);
  const orgId = orgOverride ?? memberships.find((m) => m.orgId === stored)?.orgId ?? memberships[0]?.orgId ?? "";
  const [code, setCode] = useState("");
  const [claim, setClaim] = useState<Claim | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const autoClaimed = useRef(false);

  async function doClaim(input: { token?: string; code?: string }) {
    if (!orgId) return;
    setErr(null);
    try {
      const r = await api<Claim>("/api/v1/qr/claim", { json: { orgId, ...input } });
      setClaim(r);
    } catch (e) {
      setErr(errorText(e));
    }
  }

  // QR 経由（/c?t=...）で来た場合は自動で要求
  useEffect(() => {
    if (initialToken && orgId && !autoClaimed.current) {
      autoClaimed.current = true;
      void doClaim({ token: initialToken });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken, orgId]);

  const status = usePoll<ClaimStatus>(claim ? () => api(`/api/v1/qr/claim/${claim.grantId}`) : null, 2000, [claim?.grantId]);
  useEffect(() => {
    if (status.data?.decision === "approved" && status.data.consultationSessionId) {
      router.push(`/staff/consult/${status.data.consultationSessionId}`);
    }
  }, [status.data, router]);

  async function startCamera() {
    setErr(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      setCameraOn(true);
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (text) => {
          const token = extractToken(text);
          if (!token) return;
          await scanner.stop().catch(() => {});
          setCameraOn(false);
          await doClaim({ token });
        },
        () => {},
      );
    } catch (e) {
      setCameraOn(false);
      setErr(`カメラを起動できません（HTTPS と権限が必要です）: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => () => void scannerRef.current?.stop().catch(() => {}), []);

  if (claim) {
    const d = status.data?.decision;
    return (
      <section className="card space-y-3" aria-live="polite">
        <h2 className="font-bold">患者さんの承認を待っています</h2>
        <p className="text-ink-soft">患者さんのスマートフォンに、{claim.orgName} からの共有の要求が表示されています。</p>
        {d === "denied" && <p className="text-danger font-bold">患者さんが共有を許可しませんでした。</p>}
        {d === "expired" && <p className="text-danger font-bold">QR の有効期限が切れました。新しい QR を表示してもらってください。</p>}
        {d === "approved" && <p className="text-ok font-bold">承認されました。画面を移動します…</p>}
        {(d === "denied" || d === "expired") && (
          <button className="btn btn-block" onClick={() => { setClaim(null); setCode(""); }}>
            もう一度読み取る
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <label className="label" htmlFor="org">
          読み取る医療機関
        </label>
        <select id="org" className="input" value={orgId} onChange={(e) => { setOrgOverride(e.target.value); setStoredOrgId(e.target.value); }}>
          {memberships.map((m) => (
            <option key={m.orgId} value={m.orgId}>
              {m.orgName}
            </option>
          ))}
        </select>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">カメラで読み取る</h2>
        <div id="qr-reader" className={`rounded-xl overflow-hidden ${cameraOn ? "" : "hidden"}`} />
        {!cameraOn && (
          <button className="btn btn-block" onClick={startCamera}>
            カメラを起動
          </button>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">6 桁の番号で読み取る</h2>
        <p className="text-sm text-ink-soft">患者さんの画面に表示されている番号を入力します。</p>
        <input
          className="input code-display text-center"
          inputMode="numeric"
          maxLength={6}
          aria-label="6桁の番号"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        <button className="btn btn-primary btn-block" disabled={code.length !== 6 || !orgId} onClick={() => doClaim({ code })}>
          共有を要求する
        </button>
      </section>
      {err && <p className="text-danger">{err}</p>}
    </div>
  );
}
