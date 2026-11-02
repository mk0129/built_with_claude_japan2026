import { requirePageUser } from "@/server/auth/session";

export default async function ScoresPage() {
  await requirePageUser("patient");
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">理解のきろく</h1>
      <section className="card">
        <p className="text-ink-soft">まだ記録がありません。しおりを読んで確認問題に答えると、ここに記録が残ります。</p>
        <p className="text-sm text-ink-muted mt-2">点数は「次の診察で先生と確認する材料」です。良し悪しを示すものではありません。</p>
      </section>
    </main>
  );
}
