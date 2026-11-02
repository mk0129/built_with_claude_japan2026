import { requirePageUser } from "@/server/auth/session";
import { getVersionContent } from "@/server/services/materials";
import { listApprovedFiguresForVersion } from "@/server/services/figures";
import { LearnVariant, type Variant } from "./LearnVariant";

/**
 * 教材学習画面のレイアウト比較（UX-09 の検討用・医療者のみ）。
 * 図解は患者と同じ「承認済み・画像あり」だけを使う（未承認図解は出さない）。
 */
export default async function DesignLearnPage({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ variant?: string; slide?: string }> }) {
  await requirePageUser("staff");
  const { versionId } = await params;
  const sp = await searchParams;
  const variant = (["A", "B", "C"].includes(sp.variant ?? "") ? sp.variant : "B") as Variant;
  const c = await getVersionContent(versionId);
  const figures = await listApprovedFiguresForVersion(versionId);
  const slides = c.slides.map((s) => ({ seq: s.seq, title: s.title, proposition: s.proposition, bodyMd: s.bodyMd, detailMd: s.detailMd, voiceText: s.voiceText ?? s.bodyMd, figures: figures[s.seq] ?? [] }));
  const initial = Math.min(Math.max(Number(sp.slide ?? 1) || 1, 1), slides.length);
  return <LearnVariant variant={variant} title={c.title} slides={slides} initialSeq={initial} questionCount={c.questions.length} />;
}
