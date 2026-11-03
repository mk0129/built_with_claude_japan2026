import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { computeHomeworkScore, computeScoreSummary } from "@/server/services/scoring";
import { listHomeworkForPatient } from "@/server/services/prescription";
import { listFeedbackForPatient } from "@/server/services/questions";
import { getPatientLibrary, learnedItems } from "@/server/services/library";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { Icon } from "@/components/reset/Icons";
import { LevelChip, PhaseChip, nextHref } from "@/components/reset/Status";
import { DOMAIN_LABEL, RESPONSE_LABEL, SELECTION_LABEL, STATUS_LABEL, fmtDate, fmtScore } from "@/lib/labels";
import { domainMap, domainNote } from "@/lib/understanding";

/**
 * きろく（Phase E）: 主役は 6 領域の「理解の地図」（確認できた／もう一度／未学習）。
 * 次に「もう一度確認したいこと」、教材ごとの状態、ふりかえり・質問。点数は「点数を見る（参考）」に折りたたむ。
 */
export default async function ScoresPage() {
  const u = await requirePageUser("patient");
  const summary = await computeScoreSummary(u.id);
  const sets = await listHomeworkForPatient(u.id);
  const homework = await Promise.all(sets.map(async (s) => ({ ...s, hs: await computeHomeworkScore(s.setId, u.id) })));
  const feedback = await listFeedbackForPatient(u.id);
  const learned = learnedItems((await getPatientLibrary(u.id)).items);
  const map = domainMap(learned.map((i) => ({ primaryDomain: i.primaryDomain, level: i.level, phase: i.phase, prescribed: !!i.prescribed })));
  const review = learned.filter((i) => i.level === "review");

  return (
    <>
      <header className="rs-header">
        <span className="rs-heading-small flex-1">きろく</span>
        <FontSizeToggle variant="icon" />
      </header>
      <main className="rs-content">
        <h1 className="rs-h1" style={{ fontSize: 24, margin: "4px 0 6px" }}>
          理解の地図
        </h1>
        <p className="rs-muted" style={{ marginBottom: 12 }}>
          テーマごとに、確認問題の結果から理解の様子を示しています。良し悪しではなく、次の診察で先生と話す材料です。
        </p>
        <div className="rs-map" data-testid="understanding-map">
          {map.map((c) => (
            <Link key={c.domain} href={`/library#d-${c.domain}`} className={`rs-map-cell ${c.total > 0 ? c.level : ""}`} aria-label={`${c.label}: ${c.total > 0 ? (c.level === "ok" ? "確認できた" : c.level === "review" ? "もう一度" : "未学習") : "まだ学習なし"}`}>
              <span className="name">{c.label}</span>
              {c.total > 0 ? <LevelChip level={c.level} /> : <span className="rs-lv none">まだ学習なし</span>}
              {c.total > 0 && <span className="note">{domainNote(c)}</span>}
            </Link>
          ))}
        </div>
        <p className="rs-legend" aria-label="印の意味">
          <LevelChip level="ok" /> 全問を確認できた
          <LevelChip level="review" /> まちがい・わからないがあった
          <LevelChip level="none" /> 確認問題がまだ
        </p>

        {review.length > 0 && (
          <>
            <div className="rs-section-label">
              <span>もう一度確認したいこと</span>
            </div>
            <ul className="rs-small-card" aria-label="もう一度確認したいこと">
              {review.map((i) => (
                <li key={i.materialId}>
                  <Link href={`/learn/${i.versionId}`} className="rs-item-row">
                    <div className="rs-mini-icon coral">
                      <Icon name="book" />
                    </div>
                    <div className="rs-item-info">
                      <div className="rs-item-title">{i.title}</div>
                      <div className="rs-item-sub">
                        まちがい {i.nWrong} ・ わからない {i.nUnknown} ・ 読み直す
                      </div>
                    </div>
                    <Icon name="next" size="sm" className="text-[#84959e]" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="rs-section-label">
          <span>学んだ教材</span>
          <Link href="/library" className="more">
            まなぶ →
          </Link>
        </div>
        {learned.length === 0 ? (
          <p className="rs-muted">まだありません。「まなぶ」から教材を開くと、ここに残ります。</p>
        ) : (
          <ul className="rs-small-card" aria-label="学んだ教材">
            {learned.map((i) => (
              <li key={i.materialId}>
                <Link href={nextHref(i)} className="rs-lib-row">
                  <div className="rs-item-info">
                    <div className="rs-item-title">{i.title}</div>
                    <div className="rs-item-sub">
                      {DOMAIN_LABEL[i.primaryDomain] ?? i.primaryDomain}
                      {i.completedAt ? ` ・ ${fmtDate(i.completedAt)}` : ""}
                    </div>
                    <div className="badges">
                      {i.prescribed ? <span className={`rs-badge ${i.prescribed.latest ? "rx" : ""}`}>{i.prescribed.latest ? "今回の処方" : `処方 ${fmtDate(i.prescribed.createdAt)}`}</span> : <span className="rs-badge self">自分で学習</span>}
                    </div>
                  </div>
                  <div className="right">{i.phase === "completed" ? <LevelChip level={i.level} /> : <PhaseChip phase={i.phase} lastSlideSeq={i.lastSlideSeq} slideCount={i.slideCount} />}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="rs-section-label">
          <span>ふりかえり・質問</span>
        </div>
        {feedback.length === 0 ? (
          <p className="rs-muted">まだありません。確認問題のあとに、先生に聞きたいことを残せます。</p>
        ) : (
          <ul className="rs-small-card" aria-label="ふりかえり・質問">
            {feedback.map((f) => (
              <li key={f.feedbackId} className="py-2" style={{ borderTop: "1px solid #eef1f2" }}>
                <div className="flex justify-between gap-2 items-center">
                  <span className="rs-muted">
                    {fmtDate(f.createdAt)} ・ {f.materialTitle}
                  </span>
                  {(f.freeText || f.selection === "have_question" || f.selection === "explain_again") && <span className={`rs-st ${f.status === "resolved" ? "done" : f.status === "reviewed" ? "doing" : "todo"}`}>{STATUS_LABEL[f.status]}</span>}
                </div>
                <p className="font-bold mt-1">{SELECTION_LABEL[f.selection]}</p>
                {f.freeText && <p className="rs-body mt-1">{f.freeText}</p>}
                {f.actions
                  .filter((a) => a.status === "resolved")
                  .map((a, i) => (
                    <p key={i} className="rs-muted mt-1">
                      {fmtDate(a.createdAt)} {a.orgName}: {a.responseType ? RESPONSE_LABEL[a.responseType] : "対応済み"}
                      {a.note ? `（${a.note}）` : ""}
                    </p>
                  ))}
              </li>
            ))}
          </ul>
        )}

        <details className="rs-small-card rs-details" style={{ marginTop: 18 }} data-testid="score-details">
          <summary>
            <Icon name="list" size="sm" />
            点数を見る（参考）
          </summary>
          <div className="space-y-3 mt-2">
            <p className="rs-muted">点数は「次の診察で先生と確認する材料」です。良し悪しを示すものではありません。</p>
            <p>
              全体 <b>{fmtScore(summary.overall.score)}</b>
              <span className="rs-muted">（評価済み {summary.overall.evaluated} / 学んだ教材 {summary.overall.total}）</span>
            </p>
            {homework.length > 0 && (
              <div>
                <p className="font-bold">処方ごと</p>
                {homework.map((s) => (
                  <p key={s.setId} className="flex justify-between">
                    <span>
                      {fmtDate(s.createdAt)} {s.orgName}・{s.hs.completedCount}/{s.hs.assignedCount} 完了
                    </span>
                    <b>{fmtScore(s.hs.score)}</b>
                  </p>
                ))}
              </div>
            )}
            {summary.byDomain.length > 0 && (
              <div>
                <p className="font-bold">テーマごと</p>
                {summary.byDomain.map((d) => (
                  <p key={d.domain} className="flex justify-between">
                    <span>
                      {DOMAIN_LABEL[d.domain] ?? d.domain} {d.evaluated}/{d.total}
                    </span>
                    <b>{fmtScore(d.score)}</b>
                  </p>
                ))}
              </div>
            )}
            <div>
              <p className="font-bold">教材ごと</p>
              {summary.materials.map((m) => (
                <p key={m.materialId} className="flex justify-between gap-2">
                  <span>
                    {m.title}
                    {m.attemptId && <span className="rs-muted">（正解 {m.nCorrect} ・ まちがい {m.nWrong} ・ わからない {m.nUnknown}{m.isOldVersion ? " ・ 旧版の結果" : ""}）</span>}
                  </span>
                  <b className="shrink-0">{fmtScore(m.scorePct ?? m.oldVersionScorePct)}</b>
                </p>
              ))}
            </div>
          </div>
        </details>
      </main>
    </>
  );
}
