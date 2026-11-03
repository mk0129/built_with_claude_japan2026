import { requirePageUser } from "@/server/auth/session";
import { listMemberships } from "@/server/authz/principal";
import { ScanClient } from "./ScanClient";

export default async function ScanPage() {
  const u = await requirePageUser("staff");
  const memberships = await listMemberships(u.id);
  return (
    <main className="max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">患者さんの QR を読み取る</h1>
      <ScanClient memberships={memberships.map((m) => ({ orgId: m.orgId, orgName: m.orgName }))} />
    </main>
  );
}
