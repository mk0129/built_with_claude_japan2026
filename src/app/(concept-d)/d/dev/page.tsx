import { requirePageUser } from "@/server/auth/session";
import { ConceptDDev } from "@/concept-d/ConceptDApp";

/** 開発用: Figma の検証シナリオ・テスト状態の切り替えつき Concept D（医療者のみ） */
export default async function ConceptDDevPage() {
  await requirePageUser("staff");
  return <ConceptDDev />;
}
