import Link from "next/link";
import "@/app/reset.css";
import { requirePageUser } from "@/server/auth/session";
import { getVersionContent } from "@/server/services/materials";
import { listAllFiguresForVersion, requireMaterialRole } from "@/server/services/figures";
import { FigureSet } from "@/components/patient/FigureSet";
import { FigureReviewActions } from "./FigureReviewActions";
import { STATUS_LABEL } from "@/app/staff/studio/shared";
import { Stepper } from "@/app/staff/studio/Stepper";
import { Icon } from "@/components/reset/Icons";
import { LearnClient } from "@/app/(patient)/learn/[versionId]/LearnClient";

/**
 * 管理者プレビュー（教材編集者・承認者のみ。requireMaterialRole で権限を確認）。
 * 左: 患者向け学習コンポーネント（LearnClient）をそのまま端末枠に入れて表示。進捗保存・確認問題遷移は行わない。
 * 右: 監修用の全画面一覧。未承認の図解は「監修待ち」バッジ付きで表示し、承認者は監修状態を変更できる。
 * 未承認の図解は認証付きの管理者ルートから配信され、public には置かない。患者向け API の承認条件は変えない。
 */
export default async function MaterialPreviewPage({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ layout?: string }> }) {
  const u = await requirePageUser("staff");
  const { versionId } = await params;
  const layout = (await searchParams).layout === "stack" ? "stack" : "tabs";
  const role = await requireMaterialRole({ userId: u.id, kind: "staff", name: u.name, email: u.email }, versionId);
  const c = await getVersionContent(versionId);
  const figures = await listAllFiguresForVersion(versionId);
  const pending = Object.values(figures).flat().filter((f) => f.reviewStatus !== "approved").length;
  const backHref = `/staff/studio/materials/${versionId}`;
  const view = {
    versionId: c.versionId,
    title: c.title,
    summary: c.summary,
    primaryDomain: c.primaryDomain,
    learningObjectives: c.learningObjectives,
    isCurrentVersion: c.status === "published",
    slides: c.slides.map((s) => ({ seq: s.seq, title: s.title, proposition: s.proposition, bodyMd: s.bodyMd, detailMd: s.detailMd, voiceText: s.voiceText ?? s.bodyMd, figures: figures[s.seq] ?? [] })),
    questionCount: c.questions.length,
    progress: { phase: "not_started", lastSlideSeq: 0 },
  };

  return (
    <main className="space-y-4">
      <div className="rsd-status warn" style={{ display: "flex", whiteSpace: "normal", alignItems: "flex-start" }} role="status">
        <Icon name="shield" size="sm" />
        患者画面プレビュー（医療者のみ）
        {c.status !== "published" ? ` ・ この教材は「${STATUS_LABEL[c.status] ?? c.status}」のため、患者さんには表示されません。` : ""}
        {pending > 0 ? ` ・ 未承認の図解 ${pending} 件は患者には表示されません。` : ""}
        {role.canApprove ? " 承認者として図解の監修状態を変更できます。" : ""}
      </div>
      <header className="rsd-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="min-w-0">
          <div className="rsd-eyebrow">患者画面で確認</div>
          <h1 className="rsd-h1">{c.title}</h1>
          <div className="rsd-row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <span className={`rsd-tag ${c.status === "published" ? "sage" : c.status === "in_review" ? "coral" : ""}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
            <span className="rsd-tag">版 {c.versionNo}</span>
            <span className="rsd-tag">{c.slides.length} 画面</span>
            <span className="rsd-tag">確認問題 {c.questions.length} 問</span>
          </div>
        </div>
        <div className="rsd-row" style={{ flexWrap: "nowrap", alignItems: "stretch" }}>
          <Link href={backHref} className="rsd-tallbtn">
            <Icon name="back" size="sm" />
            編集・承認画面へ
          </Link>
        </div>
      </header>
      <Stepper current={c.status === "published" ? 7 : 5} done={[1, 2, 3, 4]} />

      <div className="rsd-preview-grid">
        <section aria-label="患者と同じ画面" className="rsd-preview-phone">
          <p className="rsd-muted" style={{ marginBottom: 8 }}>患者と同じ学習画面（390px）。進捗は保存されず、確認問題へは進めません。</p>
          <div className="rsd-phone">
            <div className="reset-shell rsd-phone-scroll">
              <div className="rs-page">
                <LearnClient view={view} initialSeq={1} preview={{ backHref }} />
              </div>
            </div>
          </div>
        </section>

        <section className="rsd-card space-y-4 min-w-0" aria-label="全画面の一覧と図解の監修">
          <div className="rsd-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <h2 style={{ marginBottom: 0 }}>全画面の一覧と図解の監修</h2>
            <p className="rsd-muted">
              図解の表示:{" "}
              <Link href="?layout=tabs" className={layout === "tabs" ? "font-bold" : "rsd-link"}>
                1 枚ずつ切り替え
              </Link>
              {" ／ "}
              <Link href="?layout=stack" className={layout === "stack" ? "font-bold" : "rsd-link"}>
                縦に並べる
              </Link>
            </p>
          </div>
          {c.slides.map((s) => (
            <section key={s.id} className="space-y-2 rsd-preview-slide" aria-label={`${s.seq} 画面目`}>
              <div className="rsd-eyebrow">
                {s.seq} / {c.slides.length}
              </div>
              <h3 className="font-bold" style={{ fontSize: 17 }}>{s.title}</h3>
              {s.proposition ? <p className="font-bold">{s.proposition}</p> : <p className="rsd-muted">（要点なし）</p>}
              <FigureSet figures={figures[s.seq] ?? []} mode="admin" layout={layout} />
              {role.canApprove &&
                (figures[s.seq] ?? []).map((f) => <FigureReviewActions key={f.placementId} assetId={f.assetId} status={f.reviewStatus} hasFile={!!f.src} />)}
              <p className="whitespace-pre-wrap leading-[1.8]">{s.bodyMd}</p>
              {s.detailMd && (
                <details>
                  <summary className="cursor-pointer min-h-11 flex items-center font-bold" style={{ color: "var(--blue)" }}>くわしく読む</summary>
                  <p className="whitespace-pre-wrap leading-[1.8] rsd-muted mt-1">{s.detailMd}</p>
                </details>
              )}
            </section>
          ))}
        </section>
      </div>
    </main>
  );
}
