import { requirePageUser } from "@/server/auth/session";
import { PatientDApp } from "@/concept-d/ConceptDApp";

/** 患者 Concept D（Phase 1: Figma の架空データ。実データ接続は Phase 2） */
export default async function PatientDPage() {
  await requirePageUser("patient");
  return <PatientDApp />;
}
