import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { listHomeworkForPatient, type HomeworkItem, type HomeworkSet } from "@/server/services/prescription";
import { getPatientLibrary } from "@/server/services/library";
import { getApprovedAsset } from "@/server/services/figures";
import { SignOutButton } from "@/components/SignOutButton";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { Icon } from "@/components/reset/Icons";
import { LevelChip, PhaseChip, nextAction, nextHref } from "@/components/reset/Status";
import { DOMAIN_LABEL, estimateMinutes, fmtDate, fmtDateShort } from "@/lib/labels";
import { type Phase } from "@/lib/understanding";

const phaseOf = (i: HomeworkItem) => i.phase as Phase;
/** 処方セットの中で次に取り組む教材: 途中のもの → 未学習のもの */
function nextOf(items: HomeworkItem[]) {
  return items.find((i) => i.phase === "reading" || i.phase === "quiz") ?? items.find((i) => i.phase === "not_started") ?? null;
}

/**
 * 患者ホーム（Phase E）。最上段に「今回の処方」: 誰から・いつ・何教材中いくつ完了か、各教材の状態（未学習・途中・完了）、
 * 次にやることのボタン 1 つ。その下に、自分で学んでいる教材、教材一覧（まなぶ）への入口、前回までの処方（折りたたみ）。
 */
export default async function PatientHome() {
  const u = await requirePageUser("patient");
  const sets = await listHomeworkForPatient(u.id);
  const lib = await getPatientLibrary(u.id);
  const edi = await getApprovedAsset("EDI-001");
  const current: HomeworkSet | undefined = sets[0];
  const older = sets.slice(1);
  const items = current?.items ?? [];
  const done = items.filter((i) => i.phase === "completed").length;
  const next = nextOf(items);
  const selfLearning = lib.items.filter((i) => i.selfLearning);
  const levelByMaterial = new Map(lib.items.map((i) => [i.materialId, i.level]));
  const reviewCount = lib.items.filter((i) => (i.prescribed || i.selfLearning) && i.level === "review").length;

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
        <section className="rs-hero compact" aria-label="挨拶">
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

        {current ? (
          <section className="rs-rx" aria-labelledby="rx-title" data-testid="current-rx">
            <div className="rs-rx-head">
              <div className="rs-sender">
                <i>
                  <Icon name="book" size="sm" />
                </i>
                {fmtDateShort(current.createdAt)} ・ {current.clinicianName}から
              </div>
              <span className="rs-pill">今回の処方</span>
            </div>
            <h2 id="rx-title">今回の教材は {items.length} つです</h2>
            <div className="rs-rx-progress" aria-label={`${items.length} 教材中 ${done} 教材完了`}>
              <span>
                {done} / {items.length} 完了
              </span>
              <span className="bar" aria-hidden>
                <i style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
              </span>
            </div>
            <ol className="rs-rx-list" aria-label="今回の処方の教材">
              {items.map((i, idx) => {
                const isNext = next?.itemId === i.itemId;
                const lv = levelByMaterial.get(i.materialId) ?? "none";
                return (
                  <li key={i.itemId}>
                    <Link href={nextHref({ phase: phaseOf(i), versionId: i.versionId })}>
                      <span className={`num ${i.phase === "completed" ? "done" : isNext ? "next" : ""}`} aria-hidden>
                        {i.phase === "completed" ? "✓" : idx + 1}
                      </span>
                      <span className="t">
                        {i.title}
                        <small>
                          {DOMAIN_LABEL[i.primaryDomain] ?? i.primaryDomain} ・ 約{estimateMinutes(i.slideCount, i.questionCount)}分
                        </small>
                      </span>
                      {i.phase === "completed" && lv === "review" ? <LevelChip level="review" /> : <PhaseChip phase={phaseOf(i)} lastSlideSeq={i.lastSlideSeq} slideCount={i.slideCount} />}
                    </Link>
                  </li>
                );
              })}
            </ol>
            {next ? (
              <>
                <p className="rs-next-label">
                  次はこれ：<b>{next.title}</b>
                </p>
                <Link href={nextHref({ phase: phaseOf(next), versionId: next.versionId })} className="rs-btn primary wide" aria-label={`${nextAction({ phase: phaseOf(next) })}：${next.title}`}>
                  {nextAction({ phase: phaseOf(next) })} <Icon name="arrow" size="sm" />
                </Link>
              </>
            ) : (
              <>
                <p className="desc">今回の教材はすべて終わりました。{reviewCount > 0 ? `「もう一度」の教材が ${reviewCount} つあります。` : ""}</p>
                <Link href="/scores" className="rs-btn outline wide">
                  きろくで理解を見る
                </Link>
              </>
            )}
          </section>
        ) : (
          <section className="rs-rx" aria-labelledby="rx-title">
            <div className="rs-sender">
              <i>
                <Icon name="book" size="sm" />
              </i>
              医療者から届く教材
            </div>
            <h2 id="rx-title">まだ処方はありません</h2>
            <p className="desc">診察のときに「共有」から QR コードを見せると、先生から教材が届きます。気になるテーマは「まなぶ」から自由に読めます。</p>
            <Link href="/library" className="rs-btn primary wide">
              教材を見てみる <Icon name="arrow" size="sm" />
            </Link>
          </section>
        )}

        {selfLearning.length > 0 && (
          <>
            <div className="rs-section-label">
              <span>自分で学んでいる教材</span>
              <Link href="/library" className="more">
                まなぶ →
              </Link>
            </div>
            <ul className="rs-small-card" aria-label="自分で学んでいる教材">
              {selfLearning.map((i) => (
                <li key={i.materialId}>
                  <Link href={nextHref(i)} className="rs-item-row">
                    <div className="rs-mini-icon">
                      <Icon name="book" />
                    </div>
                    <div className="rs-item-info">
                      <div className="rs-item-title">{i.title}</div>
                      <div className="rs-item-sub">{DOMAIN_LABEL[i.primaryDomain] ?? i.primaryDomain}</div>
                    </div>
                    {i.phase === "completed" ? <LevelChip level={i.level} /> : <PhaseChip phase={i.phase} lastSlideSeq={i.lastSlideSeq} slideCount={i.slideCount} />}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <Link href="/library" className="rs-small-card rs-item-row" style={{ marginTop: 16 }}>
          <div className="rs-mini-icon">
            <Icon name="grid" />
          </div>
          <div className="rs-item-info">
            <div className="rs-item-title">ほかの教材も自由に学べます</div>
            <div className="rs-item-sub">診断から心のケアまで、テーマごとに見る</div>
          </div>
          <Icon name="next" size="sm" className="text-[#84959e]" />
        </Link>

        {older.length > 0 && (
          <details className="rs-small-card rs-details" style={{ marginTop: 16 }}>
            <summary>
              <Icon name="list" size="sm" />
              前回までの処方（{older.length}回）
            </summary>
            {older.map((s) => (
              <div key={s.setId} className="mt-3">
                <p className="rs-muted">
                  {fmtDate(s.createdAt)} ・ {s.orgName} ・ {s.clinicianName} ・ {s.items.filter((i) => i.phase === "completed").length}/{s.items.length} 完了
                </p>
                <ul>
                  {s.items.map((i) => (
                    <li key={i.itemId}>
                      <Link href={nextHref({ phase: phaseOf(i), versionId: i.versionId })} className="rs-item-row">
                        <div className="rs-item-info">
                          <div className="rs-item-title">{i.title}</div>
                        </div>
                        {i.phase === "completed" ? <LevelChip level={levelByMaterial.get(i.materialId) ?? "none"} /> : <PhaseChip phase={phaseOf(i)} lastSlideSeq={i.lastSlideSeq} slideCount={i.slideCount} />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
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
