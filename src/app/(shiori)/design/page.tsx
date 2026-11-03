import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { materials } from "@/server/db/schema";
import { eq } from "drizzle-orm";

/** デザイン比較の入口（医療者のみ）。MED-001「乳がんの診断と病期の考え方」の公開版を使う */
export default async function DesignIndex() {
  await requirePageUser("staff");
  const [m] = await getDb().select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.title, "乳がんの診断と病期の考え方")).limit(1);
  const v = m?.v;
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">デザイン比較（医療者用プレビュー）</h1>
      <p className="text-sm text-ink-soft">本番の患者画面は変更していません。実際の教材（MED-001）で案を見比べます。</p>
      {v ? (
        <ul className="space-y-2">
          {(["A", "B", "C"] as const).map((k) => (
            <li key={k}>
              <Link className="btn btn-block" href={`/design/learn/${v}?variant=${k}`}>
                教材学習 案 {k}
              </Link>
            </li>
          ))}
          <li>
            <Link className="btn btn-block" href={`/design/quiz-result/${v}?variant=current`}>
              クイズ結果（現行）
            </Link>
          </li>
          <li>
            <Link className="btn btn-block" href={`/design/quiz-result/${v}?variant=proposed`}>
              クイズ結果（改善案）
            </Link>
          </li>
        </ul>
      ) : (
        <p className="text-danger">MED-001 の公開版が見つかりません。</p>
      )}
    </main>
  );
}
