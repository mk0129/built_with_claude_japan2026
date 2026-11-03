import { requirePageUser } from "@/server/auth/session";
import { IconQuestion, IconAlert, IconClock } from "../Icons";

/**
 * 医療者の診察・理解確認（Porcelain Blue）。データは seed の履歴を模した架空値。
 * 維持: 「今日の確認事項」（質問 → 誤答・わからない → 未完了）が主役、各行に主アクション 1 つ、残り時間・延長・終了が常に見える。
 * 変更: 群ごとに色付きの番号とアイコン、点数は右列の下に小さく（折りたたみ）、処方パネルは右列に常設（lg 以上）、
 * ボタンは 44px の密度、見出しの階層（eyebrow）。
 */
export default async function PbConsult() {
  await requirePageUser("staff");
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
        <section className="card flex flex-wrap items-center gap-3 justify-between">
          <div>
            <p className="text-sm text-ink-soft">さくら総合病院 ・ 山田 医師 ・ 前回 10/19（14 日前）</p>
            <h1 className="text-xl font-bold">佐藤 花子 さん</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-wakakusa text-ink inline-flex items-center gap-1 text-sm">
              <IconClock />
              残り 59:58
            </span>
            <button className="btn">延長を要求</button>
            <button className="btn btn-danger">終了</button>
          </div>
        </section>

        <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
          <div className="space-y-4">
            <section className="card space-y-3" aria-labelledby="pb-today">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="pb-eyebrow">上から順に</p>
                  <h2 id="pb-today" className="text-lg font-bold">
                    今日の確認事項 <span className="text-ink-soft font-normal text-sm">3 件</span>
                  </h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="pill bg-sakura text-danger">質問 1</span>
                  <span className="pill bg-suna text-ink">誤答・わからない 2</span>
                  <span className="pill">未完了 1</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-danger inline-flex items-center gap-1">
                  <IconQuestion />
                  未確認の質問
                </h3>
                <div className="rounded-2xl border-2 border-sakura-deep bg-sakura/40 p-3 flex flex-wrap gap-3 items-start sm:flex-nowrap">
                  <span className="w-7 h-7 rounded-full bg-danger text-white inline-flex items-center justify-center font-bold shrink-0">1</span>
                  <div className="min-w-0 flex-1 basis-[12rem] space-y-1">
                    <p className="font-bold leading-snug">「私の場合はどういう理由で今の治療になったのか」</p>
                    <p className="text-xs text-ink-soft">10/22 ・ 乳がんの診断と病期の考え方 ・ 「質問がある」</p>
                    <p className="text-sm border-l-2 border-sakura-deep pl-2 text-ink-soft">『病期は治療の目安』の「がんの性質や体の状態で治療は変わる」がよくわかりませんでした。私の場合はどういう理由で今の治療になったのか、次に教えてください。</p>
                  </div>
                  <div className="flex flex-wrap sm:flex-col gap-1.5 w-full sm:w-auto">
                    <button className="btn btn-primary flex-1 sm:flex-none">対応を記録</button>
                    <button className="btn btn-soft flex-1 sm:flex-none">関連教材を候補へ</button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-ink inline-flex items-center gap-1">
                  <IconAlert />
                  誤答・わからない（最新の確認問題）
                </h3>
                <div className="rounded-2xl border border-line p-3 flex flex-wrap gap-3 items-start sm:flex-nowrap">
                  <span className="w-7 h-7 rounded-full bg-suna text-ink inline-flex items-center justify-center font-bold shrink-0">2</span>
                  <div className="min-w-0 flex-1 basis-[12rem] space-y-1">
                    <p className="font-bold leading-snug">
                      乳がんの診断と病期の考え方 <span className="text-xs font-normal text-ink-soft">まちがい 1 ・ わからない 1 ・ 10/22</span>
                    </p>
                    <ul className="text-sm space-y-1">
                      <li className="flex gap-2 items-start">
                        <span className="pill bg-sakura text-danger shrink-0">誤答</span>
                        <span>
                          同じ病期の人は必ず同じ治療を受けますか → 患者「病期だけで薬が決まる」／正解「<b>がんの性質や体の状態で治療は変わる</b>」
                        </span>
                      </li>
                      <li className="flex gap-2 items-start">
                        <span className="pill shrink-0">わからない</span>
                        <span>検査結果でわからない言葉があったとき、おすすめの対応はどれですか</span>
                      </li>
                    </ul>
                  </div>
                  <div className="flex flex-wrap sm:flex-col gap-1.5 w-full sm:w-auto">
                    <button className="btn btn-soft flex-1 sm:flex-none">再処方を候補へ</button>
                    <button className="btn btn-ghost flex-1 sm:flex-none">設問を見る</button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-ink-soft">未完了の教材</h3>
                <div className="rounded-2xl border border-line p-3 flex flex-wrap gap-3 items-center">
                  <span className="w-7 h-7 rounded-full bg-accent-soft text-accent inline-flex items-center justify-center font-bold shrink-0" style={{ background: "var(--accent-soft)" }}>
                    3
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug">こころのケアと相談先</p>
                    <p className="text-xs text-ink-soft">未着手 ・ 10/19 処方 ・ 約 6 分の教材</p>
                  </div>
                  <button className="btn btn-soft w-full sm:w-auto">再処方を候補へ</button>
                </div>
              </div>
              <p className="text-sm text-ink-soft">▸ 対応済みの質問（0）・ これまでの診察（2）</p>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="card space-y-3 lg:sticky lg:top-4" aria-labelledby="pb-rx">
              <div className="flex items-center justify-between">
                <h2 id="pb-rx" className="font-bold">
                  情報処方 <span className="pill terra">候補 2</span>
                </h2>
                <button className="btn btn-ghost">閉じる</button>
              </div>
              <ul className="divide-y divide-line text-sm">
                <li className="py-2 flex items-center justify-between gap-2">
                  <span>
                    乳がんの診断と病期の考え方 <span className="pill text-xs">確認事項 2 から</span>
                  </span>
                  <button className="btn btn-ghost shrink-0 whitespace-nowrap px-2">外す</button>
                </li>
                <li className="py-2 flex items-center justify-between gap-2">
                  <span>
                    こころのケアと相談先 <span className="pill text-xs">確認事項 3 から</span>
                  </span>
                  <button className="btn btn-ghost shrink-0 whitespace-nowrap px-2">外す</button>
                </li>
              </ul>
              <button className="btn btn-primary btn-block">2 件を処方する</button>
              <p className="text-xs text-ink-soft">同じ診察の処方は 1 つの宿題セットにまとまります。</p>
              <div className="flex gap-3 border-b border-line text-sm">
                <span className="py-2 font-bold border-b-2 border-accent text-accent">テンプレート</span>
                <span className="py-2 text-ink-soft">検索</span>
              </div>
              <ul className="space-y-2 text-sm">
                <li className="rounded-xl border border-line p-3 flex justify-between gap-2">
                  <span>
                    <b>初回診断時セット</b>
                    <br />
                    <span className="text-ink-soft text-xs">診断と病期 ・ サブタイプ ・ こころのケア</span>
                  </span>
                  <button className="btn btn-ghost shrink-0">まとめて追加</button>
                </li>
                <li className="rounded-xl border border-line p-3 flex justify-between gap-2">
                  <span>
                    <b>化学療法開始時セット</b>
                    <br />
                    <span className="text-ink-soft text-xs">薬物療法の種類 ・ 副作用とセルフケア</span>
                  </span>
                  <button className="btn btn-ghost shrink-0">まとめて追加</button>
                </li>
              </ul>
            </section>
            <details className="card text-sm">
              <summary className="cursor-pointer min-h-11 flex items-center font-bold">理解確認スコア（参考: 全体 67 点 ・ 評価済み 2 / 3）</summary>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="rounded-xl bg-suna p-2.5">
                  <p className="text-xs text-ink-soft">全体</p>
                  <p className="text-lg font-bold">67 点</p>
                </div>
                <div className="rounded-xl bg-sora p-2.5">
                  <p className="text-xs text-ink-soft">前回の宿題</p>
                  <p className="text-lg font-bold">67 点</p>
                  <p className="text-xs text-ink-muted">完了 2 / 3</p>
                </div>
                <div className="rounded-xl bg-suna p-2.5">
                  <p className="text-xs text-ink-soft">領域別</p>
                  <p className="text-sm">診断と病期 67 ・ 心のケア —</p>
                </div>
              </div>
            </details>
          </aside>
        </div>
      </main>
    </div>
  );
}
