import { redirect } from "next/navigation";
import { getPageUser, requirePageUser } from "@/server/auth/session";
import { PatientDApp } from "@/concept-d/ConceptDApp";

/**
 * 患者ホーム（正式 UI: Figma Make Concept D）。一時共有は実 API、それ以外の表示は Step 2 以降で実データに接続するまで Figma の架空データ。
 * 医療者の QR（/home?view=share&connect=…）から来て未ログインなら、ログイン後に同じ URL へ戻す。
 */
export default async function PatientHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (typeof sp.connect === "string" && (await getPageUser())?.kind !== "patient") {
    redirect(`/login?returnTo=${encodeURIComponent(`/home?view=share&connect=${encodeURIComponent(sp.connect)}`)}`);
  }
  await requirePageUser("patient");
  return <PatientDApp initial={sp} />;
}
