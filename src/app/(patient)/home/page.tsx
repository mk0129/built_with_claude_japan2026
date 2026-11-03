import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { listHomeworkForPatient, type HomeworkItem, type HomeworkSet } from "@/server/services/prescription";
import { getApprovedAsset } from "@/server/services/figures";
import { SignOutButton } from "@/components/SignOutButton";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { Icon } from "@/components/reset/Icons";
import { DOMAIN_LABEL, estimateMinutes, fmtDate } from "@/lib/labels";

function hrefFor(i: HomeworkItem) {
  return i.phase === "quiz" ? `/quiz/${i.versionId}` : `/learn/${i.versionId}`;
}
function actionLabel(i: HomeworkItem) {
  if (i.phase === "quiz") return "確認問題の続きから";
  if (i.phase === "reading") return "続きから読む";
  if (i.phase === "completed") return "もう一度読む";
  return "読む・聞く";
}
function trailing(i: HomeworkItem) {
  if (i.phase === "completed") return "学習済み";
  if (i.phase === "reading" || i.phase === "quiz") return "つづきから";
  return null;
}

/**
 * 患者ホーム（Experience Reset 01）。挨拶＋水彩イラストのヒーロー → 医療者から届いた教材（主役カード、主ボタンは全幅で最下部）
 * → これまでの学び（小カードの行）。データ・遷移は従来どおり（宿題セット・進捗・EDI-001 の承認済みアセット）。
 */
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
  const others = allItems.filter((i) => i.itemId !== next?.itemId);

  return (
    <>
      <header className="rs-header">
        <div className="rs-brand" aria-label="shiori">
          <i className="rs-brandmark" aria-hidden />
          shiori
        </div>
        <FontSizeToggle variant="icon" />
      </header>
      <main className="rs-content">
        <section className="rs-hero" aria-label="挨拶">
          {edi?.src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="rs-hero-photo" src={edi.src} alt={edi.altText} />
          )}
          <div className="rs-hero-text">
            <div className="kicker">{u.name} さん、こんにちは</div>
            <h1 className="rs-h1">
              今日は、
              <br />
              ひとつずつ。
            </h1>
            <p>
              医師から届いた情報を、
              <br />
              あなたのペースで
              <br />
              読み進めましょう。
            </p>
          </div>
        </section>

        {next ? (
          <section className="rs-rx" aria-labelledby="next-title">
            <div className="rs-rx-head">
              <div className="rs-sender">
                <i>
                  <Icon name="book" size="sm" />
                </i>
                医療者から届いた教材
              </div>
              <span className="rs-pill">{inProgress ? "つづきから" : "はじめから"}</span>
            </div>
            <h2 id="next-title">{next.title}</h2>
            <p className="desc">{next.summary ?? (nextSet ? `${fmtDate(nextSet.createdAt)}に ${nextSet.orgName}・${nextSet.clinicianName}から届きました。` : "")}</p>
            <div className="rs-meta">
              <Icon name="clock" size="sm" /> 約{estimateMinutes(next.slideCount, next.questionCount)}分
              <span className="dot">·</span> 全{next.slideCount}画面
              <span className="dot">·</span>
              {next.phase === "reading" ? `${Math.min(next.lastSlideSeq, next.slideCount)}/${next.slideCount}画面` : `確認問題${next.questionCount}問`}
            </div>
            <Link href={hrefFor(next)} className="rs-btn primary wide" aria-label={`${actionLabel(next)}：${next.title}`}>
              {actionLabel(next)} <Icon name="arrow" size="sm" />
            </Link>
          </section>
        ) : allDone ? (
          <section className="rs-rx" aria-labelledby="next-title">
            <div className="rs-sender">
              <i>
                <Icon name="checkcircle" size="sm" />
              </i>
              医療者から届いた教材
            </div>
            <h2 id="next-title">届いた説明はすべて読み終えました</h2>
            <p className="desc">気になるところは何度でも読み直せます。「記録」で確認問題の結果や質問を見られます。</p>
            <Link href="/scores" className="rs-btn outline wide">
              記録を見る
            </Link>
          </section>
        ) : (
          <section className="rs-rx" aria-labelledby="next-title">
            <div className="rs-sender">
              <i>
                <Icon name="book" size="sm" />
              </i>
              医療者から届いた教材
            </div>
            <h2 id="next-title">まだ届いていません</h2>
            <p className="desc">診察のときに「共有」から QR コードを表示して医療者に見せると、説明が届きます。</p>
            <Link href="/share" className="rs-btn primary wide">
              QR コードを表示する <Icon name="arrow" size="sm" />
            </Link>
          </section>
        )}

        {others.length > 0 && (
          <>
            <div className="rs-section-label">
              <span>これまでの学び</span>
              <Link href="/scores" className="more">
                すべて見る →
              </Link>
            </div>
            <ul className="rs-small-card" aria-label="これまでの学び">
              {others.map((i) => {
                const t = trailing(i);
                return (
                  <li key={i.itemId}>
                    <Link href={hrefFor(i)} className="rs-item-row">
                      <div className={`rs-mini-icon ${i.phase === "not_started" ? "coral" : ""}`}>
                        <Icon name={i.phase === "completed" ? "checkcircle" : i.phase === "not_started" ? "heart" : "book"} />
                      </div>
                      <div className="rs-item-info">
                        <div className="rs-item-title">{i.title}</div>
                        <div className="rs-item-sub">
                          {DOMAIN_LABEL[i.primaryDomain] ?? i.primaryDomain} ・ 約{estimateMinutes(i.slideCount, i.questionCount)}分
                        </div>
                      </div>
                      {t ? <span className="rs-item-trailing">{t}</span> : <Icon name="next" size="sm" className="text-[#84959e]" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {sets.length > 1 && (
          <p className="rs-muted mt-3">
            {sets.map((s) => `${fmtDate(s.createdAt)} ${s.orgName}`).join(" ／ ")} から届いています。
          </p>
        )}

        <p className="rs-hero-secondary">
          <Icon name="help" size="sm" />
          <span>診察のときは「共有」から QR コードを見せてください。あなたが許可した 60 分だけ共有されます。緊急のときは病院の連絡先へご連絡ください。</span>
        </p>
        <div className="flex justify-end mt-2">
          <SignOutButton to="/login" />
        </div>
      </main>
    </>
  );
}
