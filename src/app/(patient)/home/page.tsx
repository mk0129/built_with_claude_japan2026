import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { listHomeworkForPatient, type HomeworkItem, type HomeworkSet } from "@/server/services/prescription";
import { getApprovedAsset } from "@/server/services/figures";
import { SignOutButton } from "@/components/SignOutButton";
import { EditorialIllustration } from "@/components/patient/EditorialIllustration";
import { DOMAIN_LABEL, PHASE_LABEL, estimateMinutes, fmtDate } from "@/lib/labels";

function hrefFor(i: HomeworkItem) {
  return i.phase === "quiz" ? `/quiz/${i.versionId}` : `/learn/${i.versionId}`;
}
function actionLabel(i: HomeworkItem) {
  if (i.phase === "quiz") return "確認問題の続きから";
  if (i.phase === "reading") return "続きから読む";
  if (i.phase === "completed") return "もう一度読む";
  return "読む・聞く";
}

export default async function PatientHome() {
  const u = await requirePageUser("patient");
  const sets = await listHomeworkForPatient(u.id);
  const edi = await getApprovedAsset("EDI-001");
  const allItems = sets.flatMap((s) => s.items);
  const inProgress = allItems.find((i) => i.phase === "reading" || i.phase === "quiz");
  const next = inProgress ?? allItems.find((i) => i.phase === "not_started") ?? null;
  const nextSet: HomeworkSet | undefined = next ? sets.find((s) => s.items.some((i) => i.itemId === next.itemId)) : sets[0];
  const doneCount = allItems.filter((i) => i.phase === "completed").length;
  const allDone = allItems.length > 0 && doneCount === allItems.length;

  return (
    <main className="space-y-6">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 pt-1">
          <p className="text-ink-soft">こんにちは</p>
          <h1 className="text-2xl font-bold leading-snug">{u.name} さん</h1>
          <p className="text-ink-soft mt-2">今日の分は 1 つだけ。読まない日があっても大丈夫です。</p>
        </div>
        {/* 挿絵は見出しの右。ログアウトは最下部に移し、ファーストビューを挨拶・挿絵・主役カードだけにする */}
        {edi && <EditorialIllustration src={edi.src} alt={edi.altText} className="shrink-0 -mt-1 -mr-1" />}
      </header>

      {next ? (
        <section className="card space-y-3" aria-labelledby="next-title">
          {nextSet && (
            <>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-sm text-ink-soft">{fmtDate(nextSet.createdAt)} の診察で届いた説明</span>
                <span className="text-sm font-bold text-accent whitespace-nowrap">
                  {nextSet.items.filter((i) => i.phase === "completed").length} / {nextSet.items.length} 読み終えた
                </span>
              </div>
              <div className="prog" aria-hidden>
                {nextSet.items.map((i) => (
                  <i key={i.itemId} className={i.phase === "completed" ? "on" : ""} />
                ))}
              </div>
            </>
          )}
          <p className="text-sm text-ink-soft pt-1">
            {inProgress ? "途中の教材" : "次に読むもの"} ・ {next.slideCount} 画面と確認問題 {next.questionCount} 問 ・ 約 {estimateMinutes(next.slideCount, next.questionCount)} 分
          </p>
          <h2 id="next-title" className="text-2xl font-bold leading-snug">
            {next.title}
          </h2>
          {next.summary && <p className="text-ink-soft">{next.summary}</p>}
          {next.phase === "reading" && (
            <p className="text-sm text-ink-soft">
              {Math.min(next.lastSlideSeq, next.slideCount)} / {next.slideCount} 画面まで読みました
            </p>
          )}
          <Link href={hrefFor(next)} className="btn btn-primary btn-block">
            <span aria-hidden>▶</span> {actionLabel(next)}
          </Link>
        </section>
      ) : allDone ? (
        <section className="card space-y-2">
          <h2 className="text-xl font-bold">届いた説明はすべて読み終えました</h2>
          <p className="text-ink-soft">気になるところは何度でも読み直せます。「きろく」で確認問題の結果や質問を見られます。</p>
          <Link href="/scores" className="btn btn-block">
            きろくを見る
          </Link>
        </section>
      ) : (
        <section className="card space-y-2">
          <h2 className="text-xl font-bold">先生から届いた説明</h2>
          <p className="text-ink-soft">まだ届いていません。診察のときに医療者から届きます。</p>
          <p className="text-sm text-ink-soft">診察では下の「共有」から QR コードを表示して、医療者に見せてください。</p>
        </section>
      )}

      {sets.map((set) => (
        <section key={set.setId} aria-label={`${fmtDate(set.createdAt)} の診察で届いた説明`}>
          <p className="text-sm text-ink-soft">
            {fmtDate(set.createdAt)} ・ {set.orgName} ・ {set.clinicianName}から
          </p>
          <ul className="mt-1">
            {set.items.map((i, idx) => (
              <li key={i.itemId}>
                <Link href={hrefFor(i)} className="flex items-center gap-3.5 min-h-[64px] py-1.5">
                  <span className={`ring ${i.phase === "completed" ? "done" : i.phase === "not_started" ? "todo" : ""}`} aria-hidden>
                    {i.phase === "completed" ? "✓" : i.phase === "not_started" ? idx + 1 : "…"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-snug">{i.title}</span>
                    <span className="block text-sm text-ink-soft">
                      {PHASE_LABEL[i.phase]} ・ {DOMAIN_LABEL[i.primaryDomain] ?? i.primaryDomain} ・ 約 {estimateMinutes(i.slideCount, i.questionCount)} 分
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-sm text-ink-soft">診察のときは「共有」から QR コードを見せてください。あなたが許可した 60 分だけ共有されます。緊急のときは病院の連絡先へご連絡ください。</p>
      <div className="flex justify-end">
        <SignOutButton to="/login" />
      </div>
    </main>
  );
}
