import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { listMemberships } from "@/server/authz/principal";
import { SignOutButton } from "@/components/SignOutButton";
import { OrgPicker } from "./OrgPicker";

export default async function StaffHome() {
  const u = await requirePageUser("staff");
  const memberships = await listMemberships(u.id);
  return (
    <main className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{u.name} さん</h1>
          <p className="text-ink-soft">所属を選んで、患者さんの QR を読み取ります。</p>
        </div>
        <SignOutButton to="/staff/login" />
      </header>
      {memberships.length === 0 ? (
        <section className="card">
          <p>所属する医療機関がありません。組織管理者に招待を依頼してください。</p>
        </section>
      ) : (
        <OrgPicker memberships={memberships} />
      )}
      <section className="grid md:grid-cols-2 gap-3">
        <div className="card space-y-2">
          <h2 className="font-bold">教材管理</h2>
          <p className="text-sm text-ink-soft">原資料のアップロード、AI 下書き、承認・公開（Day 4 で実装）</p>
          <Link href="#" className="btn" aria-disabled>
            準備中
          </Link>
        </div>
        <div className="card space-y-2">
          <h2 className="font-bold">アクセスの原則</h2>
          <p className="text-sm text-ink-soft">患者さんの記録は、本人が診察ごとに許可した 60 分間だけ閲覧できます。所属だけでは閲覧できません。</p>
        </div>
      </section>
    </main>
  );
}
