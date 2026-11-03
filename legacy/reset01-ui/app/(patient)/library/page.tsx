import { requirePageUser } from "@/server/auth/session";
import { getPatientLibrary } from "@/server/services/library";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { LibraryClient, type LibraryRow } from "./LibraryClient";

/** まなぶ（Phase E）: 公開中の教材と処方された教材を、治療の流れの順に 6 領域で一覧する。処方されていない教材も自由に学べる */
export default async function LibraryPage() {
  const u = await requirePageUser("patient");
  const { items } = await getPatientLibrary(u.id);
  const rows: LibraryRow[] = items.map((i) => ({
    materialId: i.materialId,
    versionId: i.versionId,
    title: i.title,
    summary: i.summary,
    primaryDomain: i.primaryDomain,
    ownerOrgName: i.scope === "org" ? i.ownerOrgName : null,
    slideCount: i.slideCount,
    questionCount: i.questionCount,
    prescribedAt: i.prescribed ? i.prescribed.createdAt.toISOString() : null,
    prescribedLatest: !!i.prescribed?.latest,
    selfLearning: i.selfLearning,
    phase: i.phase,
    lastSlideSeq: i.lastSlideSeq,
    level: i.level,
  }));
  return (
    <>
      <header className="rs-header">
        <span className="rs-heading-small flex-1">まなぶ</span>
        <FontSizeToggle variant="icon" />
      </header>
      <main className="rs-content">
        <h1 className="rs-h1" style={{ fontSize: 24, margin: "4px 0 6px" }}>
          教材をテーマから選ぶ
        </h1>
        <p className="rs-muted" style={{ marginBottom: 12 }}>
          先生から届いた教材のほかにも、気になるテーマを自由に読めます。自分で読んだ教材も、次の診察で先生と確認できます。
        </p>
        <LibraryClient rows={rows} />
      </main>
    </>
  );
}
