import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { route } from "@/server/http";
import { getDb } from "@/server/db/client";
import { figureAssets, figurePlacements } from "@/server/db/schema";
import { requireStaff } from "@/server/authz/principal";
import { notFound, forbidden } from "@/server/authz/errors";
import { privatePath, requireMaterialRole } from "@/server/services/figures";

/**
 * 監修前の医学的図解の画像を返す（教材編集者・承認者のみ）。
 * 画像は git 管理外の private_assets/ にあり、public には置かない。患者 API はこの URL を返さない。
 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ assetId: string }> }) => {
  const p = await requireStaff(req.headers);
  const { assetId } = await params;
  const [a] = await getDb().select().from(figureAssets).where(eq(figureAssets.assetId, assetId)).limit(1);
  if (!a || !a.filename) throw notFound("ASSET_NOT_FOUND");
  const placements = await getDb().select({ v: figurePlacements.materialVersionId }).from(figurePlacements).where(eq(figurePlacements.assetId, assetId));
  let allowed = false;
  for (const pl of placements) if (await requireMaterialRole(p, pl.v).then(() => true).catch(() => false)) allowed = true;
  if (!allowed) throw forbidden("MATERIAL_ROLE_REQUIRED");
  const file = privatePath(a.type, a.filename);
  if (!existsSync(file)) throw notFound("ASSET_FILE_NOT_FOUND");
  return new Response(new Uint8Array(await readFile(file)), {
    headers: { "content-type": "image/png", "cache-control": "private, no-store" },
  });
});
