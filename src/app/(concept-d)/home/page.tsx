import { requirePageUser } from "@/server/auth/session";
import { PatientDApp } from "@/concept-d/ConceptDApp";

/** 患者ホーム（正式 UI: Figma Make Concept D）。表示内容は Phase 2 で実データに接続するまで Figma の架空データ */
export default async function PatientHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("patient");
  return <PatientDApp initial={await searchParams} />;
}
