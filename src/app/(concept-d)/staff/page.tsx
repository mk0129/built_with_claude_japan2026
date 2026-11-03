import { requirePageUser } from "@/server/auth/session";
import { ClinicianDApp } from "@/concept-d/ConceptDApp";

/**
 * 医療者ホーム（正式 UI: Figma Make Concept D）。患者情報の表示は有効な一時共有が前提で、
 * 一時共有の接続（Phase 2）までは接続申請・承認待ちまでの画面だけ。一時共有中の画面は開発用 /d/dev で確認する。
 */
export default async function StaffHome() {
  await requirePageUser("staff");
  return <ClinicianDApp />;
}
