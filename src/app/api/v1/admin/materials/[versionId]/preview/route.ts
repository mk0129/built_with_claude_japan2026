import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { getVersionContent } from "@/server/services/materials";
import { listAllFiguresForVersion, requireMaterialRole } from "@/server/services/figures";

/** 管理者プレビュー用: 編集者・承認者のみ。未承認図解も含めて返す */
export const GET = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requireStaff(req.headers);
  const { versionId } = await params;
  const role = await requireMaterialRole(p, versionId);
  const content = await getVersionContent(versionId);
  const figures = await listAllFiguresForVersion(versionId);
  return ok({ role, title: content.title, versionNo: content.versionNo, slides: content.slides.map((s) => ({ seq: s.seq, title: s.title, proposition: s.proposition, figures: figures[s.seq] ?? [] })) });
});
