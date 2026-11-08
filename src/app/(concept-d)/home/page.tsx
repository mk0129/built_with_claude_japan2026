import { redirect } from "next/navigation";
import { getPageUser, requirePageUser } from "@/server/auth/session";
import { PatientDApp } from "@/concept-d/ConceptDApp";

/**
 * 患者ホーム（正式 UI: Figma Make Concept D）。一時共有（Step 1）と情報処方・教材・学習・理解確認（Step 2）は実 API。
 * 体調記録・診察ノートは Step 3 で接続するまで Figma の架空データ（画面上部に明示）。
 * 医療者の QR（/home?view=share&connect=…）から来て未ログインなら、ログイン後に同じ URL へ戻す。
 */
export default async function PatientHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (typeof sp.connect === "string" && (await getPageUser())?.kind !== "patient") {
    redirect(`/login?returnTo=${encodeURIComponent(`/home?view=share&connect=${encodeURIComponent(sp.connect)}`)}`);
  }
  const u = await requirePageUser("patient");
  return <PatientDApp initial={sp} userName={u.name} />;
}
