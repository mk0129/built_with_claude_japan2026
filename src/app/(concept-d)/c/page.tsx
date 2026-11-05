import { redirect } from "next/navigation";
import { getPageUser } from "@/server/auth/session";
import { listMemberships } from "@/server/authz/principal";
import { ClaimQr } from "@/concept-d/ClaimQr";

/**
 * 患者が自分のアプリに表示した QR（/c?t=…）を、医療者が端末のカメラで読み取ったときの入口。
 * 医療者としてログインしていなければ、ログイン後にここへ戻す。読み取り要求（claim）だけを行い、患者情報は返さない。
 * 共有は、患者が自分の画面で申請者を確認して承認したときにだけ始まる（既存の /api/v1/qr/claim と患者の承認）。
 */
export default async function ClaimFromPatientQr({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(t) ? t : null;
  const u = await getPageUser();
  if (u?.kind !== "staff") redirect(`/staff/login?returnTo=${encodeURIComponent(token ? `/c?t=${token}` : "/staff")}`);
  const orgs = (await listMemberships(u.id))
    .filter((m) => m.roles.includes("clinician"))
    .map((m) => ({ orgId: m.orgId, orgName: m.orgName, displayName: m.displayName ?? u.name }));
  return <ClaimQr token={token} orgs={orgs} />;
}
