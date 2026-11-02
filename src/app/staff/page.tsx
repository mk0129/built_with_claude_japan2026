import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { listMemberships } from "@/server/authz/principal";
import { SignOutButton } from "@/components/SignOutButton";
import { OrgPicker } from "./OrgPicker";
import { listVisibleMaterials } from "@/server/services/materials";

export default async function StaffHome() {
  const u = await requirePageUser("staff");
  const memberships = await listMemberships(u.id);
  const editorOrgs = memberships.filter((m) => m.roles.includes("material_editor") || m.roles.includes("material_approver"));
  const previewMaterials = editorOrgs.length ? await listVisibleMaterials({ orgId: editorOrgs[0].orgId }) : [];
  const isOperator = editorOrgs.some((m) => m.orgKind === "operator");
  const previewable = previewMaterials.filter((m) => (isOperator ? m.scope === "common" : m.scope === "org"));
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
          <p className="text-sm text-ink-soft">原資料の登録と許諾の記録、Claude による下書き、編集・承認・公開を行います。</p>
          {editorOrgs.length > 0 && (
            <Link href="/staff/studio" className="btn btn-primary min-h-11 inline-flex items-center">
              教材スタジオを開く
            </Link>
          )}
          {previewable.length > 0 ? (
            <>
              <p className="text-sm text-ink-soft">監修プレビュー（編集者・承認者のみ。未承認の図解は患者に表示されません）</p>
              <ul className="text-sm space-y-1">
                {previewable.map((m) => (
                  <li key={m.materialId}>
                    <Link href={`/staff/materials/${m.versionId}/preview`} className="tap-link underline">
                      {m.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-ink-muted">教材の編集・監修権限がある場合、ここにプレビュー一覧が表示されます。</p>
          )}
        </div>
        <div className="card space-y-2">
          <h2 className="font-bold">アクセスの原則</h2>
          <p className="text-sm text-ink-soft">患者さんの記録は、本人が診察ごとに許可した 60 分間だけ閲覧できます。所属だけでは閲覧できません。</p>
        </div>
      </section>
    </main>
  );
}
