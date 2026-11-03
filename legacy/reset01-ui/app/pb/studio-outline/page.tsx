import { readFileSync } from "node:fs";
import { requirePageUser } from "@/server/auth/session";
import { DOMAIN_LABEL } from "@/lib/labels";
import { Stepper } from "@/app/(shiori)/staff/studio/Stepper";

type Outline = { title: string; primaryDomain?: string; targetReader: string; learningObjectives: string[]; slideTitles: string[]; rationale: string };

/**
 * 教材スタジオ: 構成案の選択（Porcelain Blue）。Day 6 実 API run 3 の構成案（架空原資料）を読み込む。
 * 維持: 同じ項目を同じ順で 3 案を並べる。「おすすめ」なし。
 * 変更: 構成案を画面の主役にする（周辺の説明文・枠線・ラベルを削減）。原資料は上部 1 行の要約＋折りたたみ、
 * 作り方の 2 カードは上部の小さなトグルに、案カードは「タイトル → 画面構成 → 学習目標 → 対象・領域 → 根拠」の順に
 * 本文で差が出る項目を先に、ボタンは 1 枚に 1 つ。
 */
export default async function PbStudioOutline() {
  await requirePageUser("staff");
  let outlines: Outline[] = [];
  let candidates = 0;
  try {
    const j = JSON.parse(readFileSync(`${process.cwd()}/docs/day6/real_generation/run_20261103T0938/b_outline_job.json`, "utf8"));
    outlines = j.outputPayload.outlines;
    candidates = j.outputPayload.mustCoverCandidates?.length ?? 0;
  } catch {
    outlines = [];
  }
  return (
    <div className="pb-staff flex-1 flex flex-col">
      <header className="border-b border-line bg-surface">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold">
            しおり（仮） <span className="text-sm font-normal text-ink-soft">医療者用</span>
          </span>
          <span className="pill">架空データ・デモ</span>
        </div>
      </header>
      <main className="max-w-6xl w-full mx-auto px-4 py-5 space-y-4">
        <div className="space-y-2">
          <a href="#" className="tap-link text-accent">
            ← 教材スタジオ
          </a>
          <h1 className="text-xl font-bold">乳がんのホルモン療法を受ける方へ（架空・検証）</h1>
          <Stepper current={2} done={[1]} />
        </div>

        <details className="card flat text-sm">
          <summary className="cursor-pointer min-h-11 flex flex-wrap items-center gap-2">
            <b>原資料</b>
            <span className="pill bg-wakakusa text-ink">AI 処理可</span>
            <span className="pill bg-wakakusa text-ink">改変可</span>
            <span className="pill bg-wakakusa text-ink">Web 公開可</span>
            <span className="text-ink-soft">あおば記念病院（架空）乳腺センター・薬剤部 ・ 1,701 文字 ・ 30 段落</span>
            <span className="ml-auto text-ink-soft">抽出テキストを見る</span>
          </summary>
          <p className="mt-2 text-ink-soft">（抽出テキストはここに表示）</p>
        </details>

        <section className="space-y-3" aria-label="Claude の構成案">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="pb-eyebrow">ステップ 2</p>
              <h2 className="text-2xl font-bold">
                Claude の構成案 <span className="text-ink-soft font-normal text-base">{outlines.length} 案</span>
              </h2>
              <p className="text-sm text-ink-soft">同じ項目を同じ順に並べています。1 つ選ぶと必須事項の確認（候補 {candidates} 件）に進みます。</p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost">別の案をもう一度提案</button>
              <button className="btn btn-ghost">テーマを指定して作る</button>
            </div>
          </div>
          <ol className="grid md:grid-cols-3 gap-3">
            {outlines.map((o, i) => (
              <li key={i} className="card flex flex-col gap-3" aria-label={`案 ${i + 1}`}>
                <div>
                  <p className="pb-eyebrow">案 {i + 1}</p>
                  <h3 className="font-bold text-lg leading-snug">{o.title}</h3>
                </div>
                <div>
                  <p className="text-xs font-bold text-ink-soft mb-1">画面構成（{o.slideTitles.length}）</p>
                  <ol className="space-y-1">
                    {o.slideTitles.map((t, k) => (
                      <li key={t} className="flex gap-2 text-sm">
                        <span className="w-5 h-5 rounded-full text-[11px] inline-flex items-center justify-center shrink-0 font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                          {k + 1}
                        </span>
                        <span className="leading-snug">{t}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="text-xs font-bold text-ink-soft mb-1">学習目標（{o.learningObjectives.length}）</p>
                  <ul className="list-disc pl-5 text-sm">
                    {o.learningObjectives.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-ink-soft">
                  対象: {o.targetReader} ・ 領域: {DOMAIN_LABEL[o.primaryDomain ?? ""] ?? o.primaryDomain ?? "—"}
                </p>
                <details className="text-xs text-ink-soft">
                  <summary className="cursor-pointer min-h-9 flex items-center">根拠（原資料のどこに基づくか）</summary>
                  <p>{o.rationale}</p>
                </details>
                <button className="btn btn-primary btn-block mt-auto">この案で進む</button>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
