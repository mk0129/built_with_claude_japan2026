import { requirePageUser } from "@/server/auth/session";
import { getApprovedAsset } from "@/server/services/figures";
import { EditorialIllustration } from "@/components/patient/EditorialIllustration";
import { PatientFrame } from "../PatientFrame";
import { IconPlay } from "../Icons";

/**
 * 患者ホーム（Porcelain Blue）。データは seed の履歴（佐藤 花子・10/19 の 3 教材）を模した架空値。
 * 現行の良い部分（主役 1 枚・大きな 1 ボタン・進捗・一覧は行）はそのまま。変更: 見出しの階層（eyebrow）、
 * 挿絵を 150→128px にして見出しの幅を確保、目安時間をアイコン付きの 1 行、一覧の状態を右端の文字で明示、
 * 共有の案内を控えめな 1 行に。
 */
export default async function PbHome() {
  await requirePageUser("staff");
  const edi = await getApprovedAsset("EDI-001");
  const items = [
    { title: "乳がんの診断と病期の考え方", domain: "診断と病期", min: 7, phase: "読み終えた" },
    { title: "サブタイプと治療方針のつながり", domain: "診断と病期", min: 6, phase: "読み終えた" },
    { title: "こころのケアと相談先", domain: "心のケア・制度", min: 6, phase: "未着手" },
  ];
  return (
    <PatientFrame tab="home">
      <main className="space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 pt-1">
            <p className="text-ink-soft">こんにちは</p>
            <h1 className="text-2xl font-bold leading-snug">佐藤 花子 さん</h1>
            <p className="text-ink-soft mt-2">今日は、ひとつずつ。あなたのペースで。</p>
          </div>
          {edi && <EditorialIllustration src={edi.src} alt={edi.altText} className="shrink-0 -mt-1" size="compact" />}
        </header>

        <section className="card space-y-3" aria-labelledby="pb-next">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="text-sm text-ink-soft">10月19日の診察で届いた説明</span>
            <span className="pill terra text-xs">2 / 3 読み終えた</span>
          </div>
          <div className="prog" aria-hidden>
            <i className="on" />
            <i className="on" />
            <i />
          </div>
          <p className="pb-eyebrow pt-1">次に読むもの</p>
          <h2 id="pb-next" className="text-2xl font-bold leading-snug">
            こころのケアと相談先
          </h2>
          <p className="text-sm text-ink-soft">4 画面と確認問題 2 問 ・ 目安 約 6 分</p>
          <a href="#" className="btn btn-primary btn-block">
            <IconPlay /> 読む・聞く
          </a>
        </section>

        <section aria-label="10月19日の診察で届いた説明">
          <p className="pb-eyebrow">届いた説明</p>
          <p className="text-sm text-ink-soft">10月19日 ・ さくら総合病院 ・ 山田 医師から</p>
          <ul className="mt-1 divide-y divide-line">
            {items.map((i, idx) => (
              <li key={i.title}>
                <a href="#" className="flex items-center gap-3.5 min-h-[64px] py-2">
                  <span className={`ring ${i.phase === "読み終えた" ? "done" : "todo"}`} aria-hidden>
                    {i.phase === "読み終えた" ? "✓" : idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-snug">{i.title}</span>
                    <span className="block text-sm text-ink-soft">
                      {i.domain} ・ 約 {i.min} 分
                    </span>
                  </span>
                  <span className={`text-sm whitespace-nowrap ${i.phase === "読み終えた" ? "text-ink-muted" : "font-bold text-accent"}`}>{i.phase}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-sm text-ink-soft">診察のときは「共有」から QR コードを見せてください。あなたが許可した 60 分だけ共有されます。緊急のときは病院の連絡先へご連絡ください。</p>
      </main>
    </PatientFrame>
  );
}
