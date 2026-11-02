import { redirect } from "next/navigation";
import { getPageUser } from "@/server/auth/session";
import { listMemberships } from "@/server/authz/principal";
import { ScanClient } from "@/app/staff/scan/ScanClient";

/**
 * QR コードの着地点。QR には `/c?t=<token>` が入っている。
 * 医療者としてログイン済みなら自動で読み取り要求、未ログインなら医療者ログインへ。
 * 患者情報は含まれないので、誰が開いても患者データは見えない。
 */
export default async function QrLanding({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  if (!t) redirect("/");
  const u = await getPageUser();
  if (!u) redirect(`/staff/login?returnTo=${encodeURIComponent(`/c?t=${t}`)}`);
  if (u.kind !== "staff") redirect("/home");
  const memberships = await listMemberships(u.id);
  return (
    <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold">QR を読み取りました</h1>
      <ScanClient memberships={memberships.map((m) => ({ orgId: m.orgId, orgName: m.orgName }))} initialToken={t} />
    </main>
  );
}
