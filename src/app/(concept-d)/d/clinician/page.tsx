import { requirePageUser } from "@/server/auth/session";
import { ClinicianDApp } from "@/concept-d/ConceptDApp";

/** 医療者 Concept D（Phase 1: Figma の架空データ。実データ接続は Phase 2） */
export default async function ClinicianDPage() {
  await requirePageUser("staff");
  return <ClinicianDApp />;
}
