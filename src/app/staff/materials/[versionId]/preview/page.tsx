import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { getVersionContent } from "@/server/services/materials";
import { listAllFiguresForVersion, requireMaterialRole } from "@/server/services/figures";
import { MedicalFigure } from "@/components/patient/MedicalFigure";
import { FigureReviewActions } from "./FigureReviewActions";

/**
 * 管理者プレビュー（教材編集者・承認者のみ）。
 * 患者画面と同じ構成で、未承認の図解を「監修待ち」バッジ付きで表示し、承認者は監修状態を変更できる。
 */
export default async function MaterialPreviewPage({ params }: { params: Promise<{ versionId: string }> }) {
  const u = await requirePageUser("staff");
  const { versionId } = await params;
  const role = await requireMaterialRole({ userId: u.id, kind: "staff", name: u.name, email: u.email }, versionId);
  const c = await getVersionContent(versionId);
  const figures = await listAllFiguresForVersion(versionId);
  const pending = Object.values(figures).flat().filter((f) => f.reviewStatus !== "approved").length;

  return (
    <main className="max-w-2xl mx-auto space-y-5">
      <div className="rounded-xl bg-suna text-[#8a5a0a] text-sm font-bold px-4 py-3">
        管理者プレビュー ・ 未承認の図解 {pending} 件は患者には表示されません。{role.canApprove ? "承認者として監修状態を変更できます。" : "監修状態の変更は承認者のみ行えます。"}
      </div>
      <header>
        <Link href="/staff" className="tap-link">
          ← 医療者ホーム
        </Link>
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="text-sm text-ink-soft">
          版 {c.versionNo} ・ {c.status} ・ {c.slides.length} 画面 ・ 確認問題 {c.questions.length} 問
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
            {(figures[s.seq] ?? []).map((f) => (
              <div key={f.placementId} className="space-y-2">
                <MedicalFigure figure={f} mode="admin" />
                {role.canApprove && <FigureReviewActions assetId={f.assetId} status={f.reviewStatus} hasFile={!!f.src} />}
              </div>
            ))}
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
