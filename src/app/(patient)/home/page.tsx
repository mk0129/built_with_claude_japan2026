import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { listHomeworkForPatient, type HomeworkItem } from "@/server/services/prescription";
import { SignOutButton } from "@/components/SignOutButton";
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
  const allItems = sets.flatMap((s) => s.items);
  const inProgress = allItems.find((i) => i.phase === "reading" || i.phase === "quiz");
  const next = inProgress ?? allItems.find((i) => i.phase === "not_started") ?? null;
  const doneCount = allItems.filter((i) => i.phase === "completed").length;
  const allDone = allItems.length > 0 && doneCount === allItems.length;

  return (
    <main className="relative space-y-5">
      <div className="blob bg-wakakusa w-56 h-56 -top-16 -right-20" />
      <header className="relative flex items-start justify-between">
        <div>
          <p className="text-ink-soft">こんにちは、</p>
          <h1 className="text-2xl font-bold">{u.name} さん</h1>
        </div>
        <SignOutButton to="/login" />
      </header>

      {/* 最上部の主導線: 次に読む教材 */}
      {next ? (
        <section className="card border-2 border-sakura-deep space-y-3 relative" aria-labelledby="next-title">
          <p className="text-sm text-ink-soft">{inProgress ? "途中の教材があります" : "次に読む教材"}</p>
          <h2 id="next-title" className="text-xl font-bold leading-snug">
            {next.title}
          </h2>
          <p className="text-sm text-ink-muted">
            {DOMAIN_LABEL[next.primaryDomain] ?? next.primaryDomain} ・ {next.slideCount}画面と確認問題{next.questionCount}問 ・ 目安 約{estimateMinutes(next.slideCount, next.questionCount)}分
          </p>
          {next.phase !== "not_started" && (
            <div>
              <div className="flex justify-between text-xs text-ink-soft">
                <span>{PHASE_LABEL[next.phase]}</span>
                <span>
                  {next.phase === "quiz" ? "説明は読み終えました" : `${Math.min(next.lastSlideSeq, next.slideCount)} / ${next.slideCount} 画面`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-line overflow-hidden" aria-hidden>
                <div
                  className="h-full bg-accent"
                  style={{ width: `${next.phase === "quiz" ? 100 : Math.round((100 * Math.min(next.lastSlideSeq, next.slideCount)) / Math.max(next.slideCount, 1))}%` }}
                />
              </div>
            </div>
          )}
          <Link href={hrefFor(next)} className="btn btn-primary btn-block text-lg">
            {actionLabel(next)}
          </Link>
          {allItems.length > 1 && (
            <p className="text-sm text-ink-soft">
              届いた {allItems.length} 件のうち {doneCount} 件を読み終えました。あなたのペースで大丈夫です。
            </p>
          )}
        </section>
      ) : allDone ? (
        <section className="card border-2 border-wakakusa space-y-2">
          <h2 className="text-lg font-bold">届いた教材はすべて読み終えました</h2>
          <p className="text-ink-soft">気になるところは何度でも読み直せます。「きろく」で確認問題の結果や質問を見られます。</p>
          <Link href="/scores" className="btn btn-block">
            きろくを見る
          </Link>
        </section>
      ) : (
        <section className="card space-y-2 relative">
          <h2 className="font-bold">先生から届いた教材</h2>
          <p className="text-ink-soft">まだ届いていません。診察のときに医療者から届きます。</p>
          <p className="text-sm text-ink-muted">診察では下の「共有」から QR コードを表示して、医療者に見せてください。</p>
        </section>
      )}

      {sets.map((set) => (
        <section key={set.setId} className="card space-y-3">
          <div>
            <h2 className="font-bold">{fmtDate(set.createdAt)} の診察で届いた教材</h2>
            <p className="text-sm text-ink-muted">
              {set.orgName} ・ {set.clinicianName}
            </p>
          </div>
          <ul className="space-y-2">
            {set.items.map((i) => (
              <li key={i.itemId}>
                <Link href={hrefFor(i)} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-3 min-h-[var(--tap)]">
                  <div className="min-w-0">
                    <p className="font-bold leading-snug">{i.title}</p>
                    <p className="text-xs text-ink-muted">
                      {DOMAIN_LABEL[i.primaryDomain] ?? i.primaryDomain} ・ 約{estimateMinutes(i.slideCount, i.questionCount)}分
                    </p>
                  </div>
                  <span className={`pill shrink-0 ${i.phase === "completed" ? "bg-wakakusa" : i.phase === "not_started" ? "" : "bg-sora"}`}>{PHASE_LABEL[i.phase]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="card space-y-2">
        <h2 className="font-bold">診察のときは</h2>
        <p className="text-sm text-ink-soft">下の「共有」から QR コードを表示し、医療者に見せてください。あなたが許可した 60 分だけ、記録が共有されます。</p>
        <Link href="/share" className="btn btn-block">
          共有画面を開く
        </Link>
      </section>

      <section className="card space-y-1">
        <h2 className="font-bold">このアプリについて</h2>
        <p className="text-sm text-ink-soft">ここに届く情報は医療者が確認したものです。質問は次の診察で確認されます。緊急のときは病院の連絡先へご連絡ください。</p>
      </section>
    </main>
  );
}
