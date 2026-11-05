"use client";

/**
 * Figma Concept D の画面を、一時共有の実 API に接続するフック（Step 1）。
 * 画面（DOM・CSS）は Figma のまま。ここでは画面が持っていた架空の状態（共有中かどうか・残り時間・相手の名前など）を API の値に置き換える。
 *
 * 共有の正式な方式: 医療者が QR を表示 → 患者がスマートフォンの標準カメラで読み取り（/home?view=share&connect=…）→ 申請者を確認して明示承認。
 * QR を読み取れないときの代替: 患者が 6 桁コードを表示 → 医療者が PC で入力 → 患者が申請者を確認して承認。
 * 医療者: 接続申請（QR）→ 患者の承認をポーリング → 一時共有中。
 *         互換: 患者発行 QR の /c（読み取り要求 → /staff?grant=… で患者の承認を待つ）も残す（患者画面には QR を出さない）。
 * 患者: 申請者の確認・明示承認・共有中の残り時間・延長の再承認・即時終了。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, errorText } from "@/lib/api";
import { setStoredOrgId, useStoredOrgId } from "@/lib/use-stored-org";

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
/** 接続申請を出せる医療機関（診療権限のある所属先） */
export type ClinicianOrg = { orgId: string; orgName: string; displayName: string };

/** initialGrantId: 患者の QR を読み取って要求済みのグラント（/c から来たとき）。患者の承認を待つ画面から始める */
export function useClinicianLive(initialSessionId: string | null, orgs: ClinicianOrg[], notify: (message: string) => void, initialGrantId: string | null = null) {
  const [state, setStateRaw] = useState<Session>(initialSessionId ? "active" : initialGrantId ? "waiting" : "none");
  const [request, setRequest] = useState<{ requestId: string; orgId: string; expiresAt: number } | null>(null);
  const [grantId, setGrantId] = useState<string | null>(initialSessionId ? null : initialGrantId);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [consult, setConsult] = useState<Consultation | null>(null);
  const [extensionRequested, setExtensionRequested] = useState(false);
  // 申請を出す医療機関。複数あるときは医療者が選ぶ（端末に記憶。権限はサーバーで検証）
  const storedOrgId = useStoredOrgId();
  const orgId = orgs.find((o) => o.orgId === storedOrgId)?.orgId ?? (orgs.length === 1 ? orgs[0].orgId : null);
  const org = orgs.find((o) => o.orgId === orgId) ?? null;
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  const now = useNow(state === "active");

  const issue = useCallback(async (forOrgId?: string) => {
    setQrDataUrl(null);
    setGrantId(null);
    const target = forOrgId ?? orgId;
    if (!target) return; // 複数の所属先があり未選択（画面で選ぶと発行する）
    try {
      const r = await api<{ requestId: string; orgId: string; qrUrl: string; expiresAt: string }>("/api/v1/connect", { json: { orgId: target } });
      setRequest({ requestId: r.requestId, orgId: r.orgId, expiresAt: new Date(r.expiresAt).getTime() });
      setQrDataUrl(await QRCode.toDataURL(r.qrUrl, { width: 328, margin: 1, color: { dark: "#243a3d", light: "#ffffff" } }));
    } catch (e) {
      notifyRef.current(errorText(e));
    }
  }, [orgId]);

  const begin = useCallback((sid: string) => {
    setSessionId(sid);
    setUrlParam("grant", null);
    setUrlParam("s", sid);
    setRequest(null);
    setGrantId(null);
    setStateRaw("active");
  }, []);

  /** Figma の画面からの状態変更。「一時共有中」へは患者の承認（ポーリング）でしか進めない */
  const setState = useCallback(
    (next: Session) => {
      if (next === "active") return;
      // 承認待ちから離れるときは、読み取り要求したグラントの確認をやめる（承認されても共有を開かない）
      if (next !== "waiting" && grantId) {
        setGrantId(null);
        setUrlParam("grant", null);
      }
      if (next === "request") void issue();
      if (next === "none" && request) void api(`/api/v1/connect/${request.requestId}/cancel`, { json: {} }).catch(() => {});
      if (next === "none") setRequest(null);
      setStateRaw(next);
    },
    [issue, request, grantId],
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
            setUrlParam("grant", null);
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
        if (!orgId) throw new Error("申請を出す医療機関を選んでください");
        const g = await api<{ grantId: string }>("/api/v1/qr/claim", { json: { orgId, code } });
        setGrantId(g.grantId);
        setStateRaw("waiting");
      } catch (e) {
        notifyRef.current(errorText(e));
      }
    },
    [orgId],
  );

  /** 医療機関の切り替え。申請中なら、古い申請を取り消して新しい医療機関で QR を出し直す */
  const chooseOrg = useCallback(
    (next: string) => {
      if (request) void api(`/api/v1/connect/${request.requestId}/cancel`, { json: {} }).catch(() => {});
      setRequest(null);
      setQrDataUrl(null);
      setStoredOrgId(next);
      if (state === "request") void issue(next);
    },
    [request, state, issue],
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
    sessionId,
    setState,
    orgs,
    org,
    chooseOrg,
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

/** 承認待ちの申請（医療者の QR／患者の 6 桁コードを医療者が入力／共有中の延長） */
type PatientPending = { kind: "connect" | "code" | "extension"; orgName: string; clinicianName: string };

export function usePatientLive(connectToken: string | null, notify: (message: string) => void) {
  const [token, setToken] = useState<string | null>(connectToken);
  const [connectReq, setConnectReq] = useState<{ orgName: string; clinicianName: string } | null>(null);
  // 患者が発行した共有コード（QR と 6 桁コードは同じグラント。5 分・1 回限り）。QR は画像だけを持ち、トークンを文字で表示・保存しない
  const [code, setCode] = useState<{ grantId: string; code: string; expiresAt: number } | null>(null);
  const [claimed, setClaimed] = useState<{ orgName: string; clinicianName: string } | null>(null);
  const [consult, setConsult] = useState<Consultation | null>(null);
  const [tick, setTick] = useState(0);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  const now = useNow(!!consult?.active || !!code);
  const toldExtension = useRef<string | null>(null);

  // QR から来たとき: 申請者を確認（承認前）
  useEffect(() => {
    if (!token) return;
    api<{ decision: string; orgName: string; clinicianName: string }>("/api/v1/connect/preview", { json: { token } })
      .then((r) => {
        if (r.decision === "pending") setConnectReq({ orgName: r.orgName, clinicianName: r.clinicianName });
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

  // 6 桁コード: 医療者の入力（要求）と期限を 2 秒ごとに確認
  useEffect(() => {
    if (!code) return;
    const t = window.setInterval(async () => {
      try {
        const g = await api<{ decision: string; claimed: { orgName: string; clinicianName: string } | null }>(`/api/v1/qr/${code.grantId}`);
        if (g.decision === "pending") setClaimed(g.claimed);
        else {
          if (g.decision === "expired") notifyRef.current("6桁コードの有効期限が切れました");
          setCode(null);
          setClaimed(null);
          setTick((v) => v + 1);
        }
      } catch {
        /* 次の周期で再試行 */
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [code]);

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
  const pending = useMemo<PatientPending | null>(
    () =>
      token && connectReq
        ? { kind: "connect", ...connectReq }
        : code && claimed
          ? { kind: "code", ...claimed }
          : extensionPending && consult
            ? { kind: "extension", orgName: consult.orgName, clinicianName: consult.clinicianName }
            : null,
    [token, connectReq, code, claimed, extensionPending, consult],
  );

  const clearConnect = useCallback(() => {
    setToken(null);
    setConnectReq(null);
    setUrlParam("connect", null);
  }, []);

  /** 申請の承認（医療者の QR／6 桁コードの要求／延長）。申請がなければ何もしない */
  const approve = useCallback(async () => {
    try {
      if (pending?.kind === "connect" && token) {
        await api("/api/v1/connect/approve", { json: { token } });
        clearConnect();
      } else if (pending?.kind === "code" && code) {
        await api(`/api/v1/qr/${code.grantId}/approve`, { json: {} });
        setCode(null);
        setClaimed(null);
      } else if (pending?.kind === "extension" && consult) {
        await api(`/api/v1/consultations/${consult.id}/extend/decide`, { json: { approve: true } });
      } else return;
      setTick((v) => v + 1);
    } catch (e) {
      notifyRef.current(errorText(e));
    }
  }, [pending, token, code, consult, clearConnect]);

  /** 申請を断る（医療者には「共有されなかった」ことだけが伝わる） */
  const deny = useCallback(async () => {
    try {
      if (pending?.kind === "connect" && token) {
        await api("/api/v1/connect/deny", { json: { token } });
        clearConnect();
      } else if (pending?.kind === "code" && code) {
        await api(`/api/v1/qr/${code.grantId}/deny`, { json: {} });
        setCode(null);
        setClaimed(null);
      } else if (pending?.kind === "extension" && consult) {
        await api(`/api/v1/consultations/${consult.id}/extend/decide`, { json: { approve: false } });
      } else return;
      notifyRef.current(pending.kind === "extension" ? "延長しませんでした" : "共有しませんでした");
      setTick((v) => v + 1);
    } catch (e) {
      notifyRef.current(errorText(e));
    }
  }, [pending, token, code, consult, clearConnect]);

  /**
   * QR を読み取れないときの 6 桁コードの発行（既存の POST /api/v1/qr）。5 分・1 回限り。
   * 医療者が入力した後も、患者の承認があるまで共有しない。同じ発行で返る QR の URL（/c、互換用）は画面に出さない。
   */
  const issueCode = useCallback(async () => {
    try {
      const g = await api<{ grantId: string; code: string; expiresAt: string }>("/api/v1/qr", { json: {} });
      setClaimed(null);
      setCode({ grantId: g.grantId, code: g.code, expiresAt: new Date(g.expiresAt).getTime() });
    } catch (e) {
      notifyRef.current(errorText(e));
    }
  }, []);

  const cancelCode = useCallback(async () => {
    if (code) await api(`/api/v1/qr/${code.grantId}/deny`, { json: {} }).catch(() => {});
    setCode(null);
    setClaimed(null);
  }, [code]);

  const end = useCallback(async () => {
    if (consult) await api(`/api/v1/consultations/${consult.id}/end`, { json: {} }).catch(() => {});
    setConsult(null);
    setTick((v) => v + 1);
  }, [consult]);

  const codeRemainingSec = code ? Math.max(0, Math.floor((code.expiresAt - now) / 1000)) : 0;
  return {
    sharing,
    pending,
    /** 互換: 承認前の申請者の表示名 */
    pendingLabel: pending && pending.kind !== "extension" ? `${pending.orgName} ${pending.clinicianName}` : null,
    extensionPending,
    clinicianName: consult?.clinicianName ?? null,
    clinicianLabel: consult ? `${consult.orgName} ${consult.clinicianName}` : null,
    remainingMin,
    code: code ? { value: `${code.code.slice(0, 3)} ${code.code.slice(3)}`, remainingMin: Math.ceil(codeRemainingSec / 60) } : null,
    issueCode,
    cancelCode,
    approve,
    deny,
    end,
  };
}
