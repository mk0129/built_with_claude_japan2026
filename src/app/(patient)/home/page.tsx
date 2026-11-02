import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { listHomeworkForPatient } from "@/server/services/prescription";
import { SignOutButton } from "@/components/SignOutButton";
import { DOMAIN_LABEL, PHASE_LABEL, fmtDate } from "@/lib/labels";

export default async function PatientHome() {
  const u = await requirePageUser("patient");
  const sets = await listHomeworkForPatient(u.id);
  const allItems = sets.flatMap((s) => s.items);
  const resume = allItems.find((i) => i.phase === "reading" || i.phase === "quiz") ?? allItems.find((i) => i.phase === "not_started");
  const doneCount = allItems.filter((i) => i.phase === "completed").length;

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

      {resume && (
        <Link href={resume.phase === "quiz" ? `/quiz/${resume.versionId}` : `/learn/${resume.versionId}`} className="card block border-2 border-sakura-deep space-y-1">
          <p className="text-sm text-ink-soft">{resume.phase === "not_started" ? "次に読むしおり" : "続きから"}</p>
          <p className="font-bold text-lg">{resume.title}</p>
          <p className="text-sm text-ink-muted">{PHASE_LABEL[resume.phase]}</p>
        </Link>
      )}

      {allItems.length > 0 && (
        <p className="text-sm text-ink-soft">
          {allItems.length} 件のうち {doneCount} 件を読み終えました。あなたのペースで大丈夫です。
        </p>
      )}

      {sets.length === 0 ? (
        <section className="card space-y-2 relative">
          <h2 className="font-bold">届いたしおり</h2>
          <p className="text-ink-soft">まだ届いていません。診察のときに医療者から届きます。</p>
        </section>
      ) : (
        sets.map((set) => (
          <section key={set.setId} className="card space-y-3">
            <div>
              <h2 className="font-bold">{fmtDate(set.createdAt)} のしおり</h2>
              <p className="text-sm text-ink-muted">{set.orgName} ・ {set.clinicianName}</p>
            </div>
            <ul className="space-y-2">
              {set.items.map((i) => (
                <li key={i.itemId}>
                  <Link
                    href={i.phase === "quiz" ? `/quiz/${i.versionId}` : `/learn/${i.versionId}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-3 min-h-[var(--tap)]"
                  >
                    <div className="min-w-0">
                      <p className="font-bold leading-snug">{i.title}</p>
                      <p className="text-xs text-ink-muted">{DOMAIN_LABEL[i.primaryDomain] ?? i.primaryDomain}</p>
                    </div>
                    <span className={`pill shrink-0 ${i.phase === "completed" ? "bg-wakakusa" : i.phase === "not_started" ? "" : "bg-sora"}`}>
                      {PHASE_LABEL[i.phase]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Link href="/share" className="btn btn-primary btn-block">
        医療者に共有する（QR を表示）
      </Link>

      <section className="card space-y-1">
        <h2 className="font-bold">このアプリについて</h2>
        <p className="text-sm text-ink-soft">
          ここに届く情報は医療者が確認したものです。質問は次の診察で確認されます。緊急のときは病院の連絡先へご連絡ください。
        </p>
      </section>
    </main>
  );
}
