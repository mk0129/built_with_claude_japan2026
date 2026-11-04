"use client";

/**
 * 医療者: 患者の QR を読み取った後の画面（/c）。申請を出す医療機関で読み取り要求を送り、患者の承認待ち（/staff?grant=…）へ進む。
 * トークンは URL からすぐに消し、画面に表示しない。失効・使用済み・他の医療者が読み取り済みのときは、理由だけを表示する。
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, errorText } from "@/lib/api";
import { setStoredOrgId, useStoredOrgId } from "@/lib/use-stored-org";
import type { ClinicianOrg } from "./live";
import { ShioriLogo } from "./ShioriLogo";

export function ClaimQr({ token, orgs }: { token: string | null; orgs: ClinicianOrg[] }) {
  const stored = useStoredOrgId();
  const [chosen, setChosen] = useState<string | null>(null);
  const orgId = chosen ?? orgs.find((o) => o.orgId === stored)?.orgId ?? (orgs.length === 1 ? orgs[0].orgId : null);
  const [error, setError] = useState<string | null>(token ? null : "QRコードを読み取れませんでした。患者のアプリで新しいQRコードを表示してもらってください。");
  const sent = useRef(false);

  // 読み取ったトークンを URL（履歴）に残さない
  useEffect(() => {
    window.history.replaceState(window.history.state, "", "/c");
  }, []);

  useEffect(() => {
    if (!token || !orgId || sent.current) return;
    sent.current = true;
    api<{ grantId: string }>("/api/v1/qr/claim", { json: { orgId, token } })
      .then((g) => window.location.replace(`/staff?grant=${g.grantId}`))
      .catch((e) => setError(errorText(e)));
  }, [token, orgId]);

  return (
    <main className="au-stage au-staff">
      <div className="au-column">
        <ShioriLogo sub="for medical" />
        <header className="au-head">
          <p className="eyebrow">PATIENT QR</p>
          <h1>患者のQRコードを読み取りました</h1>
          <p>患者が自分の画面で申請者を確認して承認するまで、患者情報は表示されません。</p>
        </header>
        {error ? (
          <section className="au-card" role="alert" data-claim-error>
            <h2>接続を申請できませんでした</h2>
            <p className="au-card-text">{error}</p>
            <Link href="/staff" className="au-button au-link-button">
              医療者ホームへ
            </Link>
          </section>
        ) : orgs.length === 0 ? (
          <section className="au-card" role="alert">
            <h2>申請を出せる医療機関がありません</h2>
            <p className="au-card-text">診療の権限がある所属先がないため、接続を申請できません。</p>
          </section>
        ) : !orgId ? (
          <section className="au-card">
            <h2>申請を出す医療機関を選んでください</h2>
            <div className="au-accounts">
              {orgs.map((o) => (
                <button
                  key={o.orgId}
                  className="au-account"
                  onClick={() => {
                    setStoredOrgId(o.orgId);
                    setChosen(o.orgId);
                  }}
                >
                  <b>{o.orgName}</b>
                  <small>{o.displayName}</small>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="au-card" role="status">
            <h2>患者へ接続を申請しています…</h2>
            <p className="au-card-text">このあと、患者の承認を待つ画面に切り替わります。</p>
          </section>
        )}
      </div>
    </main>
  );
}
