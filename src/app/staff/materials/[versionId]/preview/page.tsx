import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { getVersionContent } from "@/server/services/materials";
import { listAllFiguresForVersion, requireMaterialRole } from "@/server/services/figures";
import { FigureSet } from "@/components/patient/FigureSet";
import { FigureReviewActions } from "./FigureReviewActions";
import { STATUS_LABEL } from "@/app/staff/studio/shared";
import { Stepper } from "@/app/staff/studio/Stepper";

/**
 * 管理者プレビュー（教材編集者・承認者のみ）。
 * 患者画面と同じ構成で、未承認の図解を「監修待ち」バッジ付きで表示し、承認者は監修状態を変更できる。
 */
export default async function MaterialPreviewPage({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ layout?: string }> }) {
  const u = await requirePageUser("staff");
  const { versionId } = await params;
  const layout = (await searchParams).layout === "stack" ? "stack" : "tabs";
  const role = await requireMaterialRole({ userId: u.id, kind: "staff", name: u.name, email: u.email }, versionId);
  const c = await getVersionContent(versionId);
  const figures = await listAllFiguresForVersion(versionId);
  const pending = Object.values(figures).flat().filter((f) => f.reviewStatus !== "approved").length;

  return (
    <main className="max-w-2xl mx-auto space-y-5">
      <div className="rounded-xl bg-suna text-[#8a5a0a] text-sm font-bold px-4 py-3" role="status">
        患者画面プレビュー（医療者のみ）
        {c.status !== "published" ? ` ・ この教材は「${STATUS_LABEL[c.status] ?? c.status}」のため、患者さんには表示されません。` : ""}
        {pending > 0 ? ` ・ 未承認の図解 ${pending} 件は患者には表示されません。` : ""}
        {role.canApprove ? " 承認者として図解の監修状態を変更できます。" : ""}
      </div>
      <header className="space-y-2">
        <Stepper current={c.status === "published" ? 7 : 5} done={[1, 2, 3, 4]} />
        <div className="flex flex-wrap gap-x-3">
          <Link href={`/staff/studio/materials/${versionId}`} className="tap-link">
            ← 編集・承認画面へ
          </Link>
          <Link href="/staff" className="tap-link">
            医療者ホーム
          </Link>
        </div>
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="text-sm text-ink-soft">
          版 {c.versionNo} ・ {STATUS_LABEL[c.status] ?? c.status} ・ {c.slides.length} 画面 ・ 確認問題 {c.questions.length} 問
        </p>
        <p className="text-sm mt-1">
          図解の表示方式:{" "}
          <Link href="?layout=tabs" className={`tap-link ${layout === "tabs" ? "font-bold text-accent" : "underline"}`}>
            1 枚ずつ切り替え
          </Link>
          {" ／ "}
          <Link href="?layout=stack" className={`tap-link ${layout === "stack" ? "font-bold text-accent" : "underline"}`}>
            縦に並べる
          </Link>
        </p>
      </header>

      <div className="patient-shell rounded-3xl p-5 space-y-8">
        {c.slides.map((s) => (
          <section key={s.id} className="space-y-3" aria-label={`${s.seq} 画面目`}>
            <p className="text-sm text-ink-soft">
              {s.seq} / {c.slides.length}
            </p>
            <h2 className="text-2xl font-bold leading-snug">{s.title}</h2>
            {s.proposition ? <p className="text-xl font-bold leading-relaxed">{s.proposition}</p> : <p className="text-sm text-ink-soft">（命題なし）</p>}
            <FigureSet figures={figures[s.seq] ?? []} mode="admin" layout={layout} />
            {role.canApprove &&
              (figures[s.seq] ?? []).map((f) => <FigureReviewActions key={f.placementId} assetId={f.assetId} status={f.reviewStatus} hasFile={!!f.src} />)}
            <p className="whitespace-pre-wrap leading-[1.8]">{s.bodyMd}</p>
            {s.detailMd && (
              <details>
                <summary className="cursor-pointer min-h-11 flex items-center font-bold text-accent">くわしく読む</summary>
                <p className="whitespace-pre-wrap leading-[1.8] text-ink-soft mt-1">{s.detailMd}</p>
              </details>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
