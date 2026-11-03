"use client";

/**
 * Figma Concept D の画面を、一時共有の実 API に接続するフック（Step 1）。
 * 画面（DOM・CSS）は Figma のまま。ここでは画面が持っていた架空の状態（共有中かどうか・残り時間・相手の名前など）を API の値に置き換える。
 *
 * 医療者: 接続申請（医療者が QR を表示）→ 患者の承認をポーリング → 一時共有中。6 桁コード（患者発行）も同じ画面から使える。
 * 患者: QR の URL（/home?view=share&connect=…）で申請者を確認 → 明示承認。共有中の残り時間・延長の再承認・即時終了。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, errorText } from "@/lib/api";

type Session = "none" | "request" | "waiting" | "active" | "expired";
type Consultation = {
  id: string;
  orgName: string;
  clinicianName: string;
  expiresAt: string;
  active: boolean;
  endedBy: "patient" | "clinician" | "system" | null;
  pendingExtension: { id: string } | null;
  patientName: string | null;
};

/** 1 秒ごとに再描画して残り時間を数える */
function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [enabled]);
  return now;
}

function setUrlParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", url);
}

export type ClinicianLive = ReturnType<typeof useClinicianLive>;

export function useClinicianLive(initialSessionId: string | null, notify: (message: string) => void) {
  const [state, setStateRaw] = useState<Session>(initialSessionId ? "active" : "none");
  const [request, setRequest] = useState<{ requestId: string; orgId: string; expiresAt: number } | null>(null);
  const [grantId, setGrantId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [consult, setConsult] = useState<Consultation | null>(null);
  const [extensionRequested, setExtensionRequested] = useState(false);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  const now = useNow(state === "active");

  const issue = useCallback(async () => {
    setQrDataUrl(null);
    setGrantId(null);
    try {
      const r = await api<{ requestId: string; orgId: string; qrUrl: string; expiresAt: string }>("/api/v1/connect", { json: {} });
      setRequest({ requestId: r.requestId, orgId: r.orgId, expiresAt: new Date(r.expiresAt).getTime() });
      setQrDataUrl(await QRCode.toDataURL(r.qrUrl, { width: 328, margin: 1, color: { dark: "#243a3d", light: "#ffffff" } }));
    } catch (e) {
      notifyRef.current(errorText(e));
    }
  }, []);

  const begin = useCallback((sid: string) => {
    setSessionId(sid);
    setUrlParam("s", sid);
    setRequest(null);
    setGrantId(null);
    setStateRaw("active");
  }, []);

  /** Figma の画面からの状態変更。「一時共有中」へは患者の承認（ポーリング）でしか進めない */
  const setState = useCallback(
    (next: Session) => {
      if (next === "active") return;
      if (next === "request") void issue();
      if (next === "none" && request) void api(`/api/v1/connect/${request.requestId}/cancel`, { json: {} }).catch(() => {});
      if (next === "none") setRequest(null);
      setStateRaw(next);
    },
    [issue, request],
  );

  // 承認待ち: 申請（QR）または 6 桁コードの状態を 2 秒ごとに確認
  useEffect(() => {
    if (state !== "request" && state !== "waiting") return;
    const t = window.setInterval(async () => {
      try {
        if (grantId) {
          const g = await api<{ decision: string; consultationSessionId: string | null }>(`/api/v1/qr/claim/${grantId}`);
          if (g.decision === "approved" && g.consultationSessionId) begin(g.consultationSessionId);
          else if (g.decision !== "pending") {
            notifyRef.current(g.decision === "denied" ? "患者が共有を断りました" : "コードの有効期限が切れました");
            setGrantId(null);
            setStateRaw("request");
          }
          return;
        }
        if (!request) return;
        const r = await api<{ decision: string; consultationSessionId: string | null }>(`/api/v1/connect/${request.requestId}`);
        if (r.decision === "approved" && r.consultationSessionId) begin(r.consultationSessionId);
        else if (r.decision === "denied") {
          notifyRef.current("患者が共有を断りました");
          setStateRaw("request");
          void issue();
        } else if (r.decision === "expired" || r.decision === "cancelled") {
          // QR は 5 分で失効するため、新しい QR に差し替える
          void issue();
        }
      } catch {
        /* 次の周期で再試行 */
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [state, request, grantId, begin, issue]);

  // 一時共有中: 期限・終了・延長を 5 秒ごとに確認
  const lastExpires = useRef<number | null>(null);
  const extRef = useRef(false);
  useEffect(() => {
    if (state !== "active" || !sessionId) return;
    let stop = false;
    const load = async () => {
      try {
        const c = await api<Consultation>(`/api/v1/consultations/${sessionId}`);
        if (stop) return;
        setConsult(c);
        const exp = new Date(c.expiresAt).getTime();
        // 延長を申請していて、患者が判断した（申請が消えた）とき。承認なら期限が「その時点から 60 分」に延びる
        if (extRef.current && !c.pendingExtension) {
          notifyRef.current(lastExpires.current && exp > lastExpires.current + 1000 ? "患者が再承認しました。共有時間を60分へ延長しました" : "患者は延長を承認しませんでした");
          extRef.current = false;
          setExtensionRequested(false);
        }
        lastExpires.current = exp;
        if (!c.active) {
          setUrlParam("s", null);
          setSessionId(null);
          setStateRaw("expired");
        }
      } catch {
        setUrlParam("s", null);
        setSessionId(null);
        setStateRaw("none");
      }
    };
    void load();
    const t = window.setInterval(load, 5000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [state, sessionId]);

  const claimCode = useCallback(
    async (code: string) => {
      try {
        const orgId = request?.orgId;
        if (!orgId) throw new Error("ORG");
        const g = await api<{ grantId: string }>("/api/v1/qr/claim", { json: { orgId, code } });
        setGrantId(g.grantId);
        setStateRaw("waiting");
      } catch (e) {
        notifyRef.current(errorText(e));
      }
    },
    [request],
  );

  const requestExtension = useCallback(async () => {
    if (!sessionId) return;
    try {
      await api(`/api/v1/consultations/${sessionId}/extend`, { json: {} });
      extRef.current = true;
      setExtensionRequested(true);
    } catch (e) {
      notifyRef.current(errorText(e));
    }
  }, [sessionId]);

  const end = useCallback(async () => {
    if (sessionId) await api(`/api/v1/consultations/${sessionId}/end`, { json: {} }).catch(() => {});
    setUrlParam("s", null);
    setSessionId(null);
    setConsult(null);
    setStateRaw("none");
  }, [sessionId]);

  const remainingSec = consult ? Math.max(0, Math.floor((new Date(consult.expiresAt).getTime() - now) / 1000)) : 0;
  return {
    state,
    setState,
    qrDataUrl,
    claimCode,
    patientName: consult?.patientName ?? null,
    remainingSec,
    remainingClock: `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, "0")}`,
    remainingMin: Math.ceil(remainingSec / 60),
    extensionRequested: extensionRequested || !!consult?.pendingExtension,
    requestExtension,
    end,
  };
}

export type PatientLive = ReturnType<typeof usePatientLive>;

export function usePatientLive(connectToken: string | null, notify: (message: string) => void) {
  const [token, setToken] = useState<string | null>(connectToken);
  const [pending, setPending] = useState<{ label: string } | null>(null);
  const [consult, setConsult] = useState<Consultation | null>(null);
  const [tick, setTick] = useState(0);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  const now = useNow(!!consult?.active);
  const toldExtension = useRef<string | null>(null);

  // QR から来たとき: 申請者を確認（承認前）
  useEffect(() => {
    if (!token) return;
    api<{ decision: string; orgName: string; clinicianName: string }>("/api/v1/connect/preview", { json: { token } })
      .then((r) => {
        if (r.decision === "pending") setPending({ label: `${r.orgName} ${r.clinicianName}` });
        else {
          notifyRef.current(r.decision === "expired" ? "QRコードの有効期限が切れています。医療者に新しいQRを表示してもらってください" : "このQRコードはすでに使われています");
          setToken(null);
          setUrlParam("connect", null);
        }
      })
      .catch(() => {
        notifyRef.current("QRコードを確認できませんでした");
        setToken(null);
        setUrlParam("connect", null);
      });
  }, [token]);

  // 共有中のセッション（5 秒ごと）
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const { sessions } = await api<{ sessions: { id: string; active: boolean }[] }>("/api/v1/sessions/mine");
        const active = sessions.find((s) => s.active);
        const c = active ? await api<Consultation>(`/api/v1/consultations/${active.id}`) : null;
        if (stop) return;
        setConsult(c);
        if (c?.pendingExtension && toldExtension.current !== c.pendingExtension.id) {
          toldExtension.current = c.pendingExtension.id;
          notifyRef.current("医療者から共有時間の延長申請があります。「共有中」から確認してください");
        }
      } catch {
        /* 次の周期で再試行 */
      }
    };
    void load();
    const t = window.setInterval(load, 5000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [tick]);

  const sharing = !!consult?.active;
  const extensionPending = sharing && !!consult?.pendingExtension;
  const remainingMin = consult ? Math.max(0, Math.ceil((new Date(consult.expiresAt).getTime() - now) / 60000)) : 0;

  /** Figma の「QRを読み取って共有を開始」: 申請があれば承認、延長申請があれば再承認、どちらもなければ読み取り方を案内 */
  const approve = useCallback(async () => {
    try {
      if (token && pending) {
        await api("/api/v1/connect/approve", { json: { token } });
        setToken(null);
        setPending(null);
        setUrlParam("connect", null);
      } else if (extensionPending && consult) {
        await api(`/api/v1/consultations/${consult.id}/extend/decide`, { json: { approve: true } });
      } else {
        notifyRef.current("スマートフォンのカメラで、医療者の画面に表示されたQRコードを読み取ってください");
        return;
      }
      setTick((v) => v + 1);
    } catch (e) {
      notifyRef.current(errorText(e));
    }
  }, [token, pending, extensionPending, consult]);

  const end = useCallback(async () => {
    if (consult) await api(`/api/v1/consultations/${consult.id}/end`, { json: {} }).catch(() => {});
    setConsult(null);
    setTick((v) => v + 1);
  }, [consult]);

  return {
    sharing,
    pendingLabel: pending?.label ?? null,
    extensionPending,
    clinicianName: consult?.clinicianName ?? null,
    clinicianLabel: consult ? `${consult.orgName} ${consult.clinicianName}` : null,
    remainingMin,
    approve,
    end,
  };
}
