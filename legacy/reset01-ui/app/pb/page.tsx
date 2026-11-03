import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { materials } from "@/server/db/schema";
import { eq } from "drizzle-orm";

/** Porcelain Blue 比較の入口（医療者のみ） */
export default async function PbIndex() {
  await requirePageUser("staff");
  const [m] = await getDb().select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.title, "乳がんの診断と病期の考え方")).limit(1);
  const v = m?.v ?? "";
  const links = [
    ["/pb/home", "患者ホーム"],
    [`/pb/learn?versionId=${v}`, "教材学習（図解ストリップ）"],
    [`/pb/learn?versionId=${v}&fig=full`, "教材学習（図解を通常サイズ）"],
    [`/pb/quiz-result?versionId=${v}`, "クイズ結果（2 段階の質問）"],
    ["/pb/consult", "医療者の診察・理解確認"],
    ["/pb/studio-outline", "教材スタジオ: 構成案の選択"],
  ];
  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-3">
      <p className="pb-eyebrow">デザイン比較</p>
      <h1 className="text-2xl font-bold">Porcelain Blue 版（比較用）</h1>
      <p className="text-sm text-ink-soft">本番 UI は変更していません。配色だけでなく余白・見出し・階層・アイコン・主要ボタンの配置を含めた案です。</p>
      <ul className="space-y-2">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link className="btn btn-block" href={href}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
