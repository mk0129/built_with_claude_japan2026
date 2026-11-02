import { requirePageUser } from "@/server/auth/session";
import { computeHomeworkScore, computeScoreSummary } from "@/server/services/scoring";
import { listHomeworkForPatient } from "@/server/services/prescription";
import { listFeedbackForPatient } from "@/server/services/questions";
import { DOMAIN_LABEL, RESPONSE_LABEL, SELECTION_LABEL, STATUS_LABEL, fmtDate, fmtScore } from "@/lib/labels";

export default async function ScoresPage() {
  const u = await requirePageUser("patient");
  const summary = await computeScoreSummary(u.id);
  const sets = await listHomeworkForPatient(u.id);
  const homework = await Promise.all(sets.map(async (s) => ({ ...s, hs: await computeHomeworkScore(s.setId, u.id) })));
  const feedback = await listFeedbackForPatient(u.id);

  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">理解のきろく</h1>
      <p className="text-sm text-ink-muted">点数は「次の診察で先生と確認する材料」です。良し悪しを示すものではありません。</p>

      <section className="card space-y-2">
        <h2 className="font-bold">全体</h2>
        <p className="text-3xl font-bold">{fmtScore(summary.overall.score)}</p>
        <p className="text-sm text-ink-soft">評価済み {summary.overall.evaluated} / 届いた教材 {summary.overall.total}</p>
      </section>

      {homework.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-bold">しおりごと</h2>
          <ul className="space-y-2">
            {homework.map((s) => (
              <li key={s.setId} className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0">
                <div>
                  <p className="font-bold">{fmtDate(s.createdAt)}</p>
                  <p className="text-xs text-ink-muted">{s.orgName} ・ 読み終えた {s.hs.completedCount}/{s.hs.assignedCount}</p>
                </div>
                <span className="font-bold">{fmtScore(s.hs.score)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.byDomain.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-bold">テーマごと</h2>
          <ul className="space-y-2">
            {summary.byDomain.map((d) => (
              <li key={d.domain} className="flex items-center justify-between">
                <span>{DOMAIN_LABEL[d.domain] ?? d.domain}<span className="text-xs text-ink-muted ml-2">{d.evaluated}/{d.total}</span></span>
                <span className="font-bold">{fmtScore(d.score)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.materials.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-bold">教材ごと</h2>
          <ul className="space-y-2">
            {summary.materials.map((m) => (
              <li key={m.materialId} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="leading-snug">{m.title}</p>
                  {m.attemptId && (
                    <p className="text-xs text-ink-muted">
                      正解 {m.nCorrect} ・ まちがい {m.nWrong} ・ わからない {m.nUnknown}
                      {m.isOldVersion && <span className="pill ml-1">旧版の結果</span>}
                    </p>
                  )}
                </div>
                <span className="font-bold shrink-0">{fmtScore(m.scorePct ?? m.oldVersionScorePct)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-bold">ふりかえり・質問</h2>
        {feedback.length === 0 ? (
          <p className="text-sm text-ink-soft">まだありません。しおりを読み終えると、ここに残ります。</p>
        ) : (
          <ul className="space-y-3">
            {feedback.map((f) => (
              <li key={f.feedbackId} className="border-b border-line pb-2 last:border-0 space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-ink-soft">{fmtDate(f.createdAt)} ・ {f.materialTitle}</span>
                  {(f.freeText || f.selection === "have_question" || f.selection === "explain_again") && (
                    <span className={`pill ${f.status === "resolved" ? "bg-wakakusa" : f.status === "reviewed" ? "bg-sora" : ""}`}>{STATUS_LABEL[f.status]}</span>
                  )}
                </div>
                <p>{SELECTION_LABEL[f.selection]}</p>
                {f.freeText && <p className="text-sm bg-suna rounded-lg p-2">{f.freeText}</p>}
                {f.actions.filter((a) => a.status === "resolved").map((a, i) => (
                  <p key={i} className="text-sm text-ink-soft">
                    {fmtDate(a.createdAt)} {a.orgName}: {a.responseType ? RESPONSE_LABEL[a.responseType] : "対応済み"}
                    {a.note ? `（${a.note}）` : ""}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
