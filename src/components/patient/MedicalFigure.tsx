import type { FigureView } from "@/server/services/figures";

const STATUS_LABEL: Record<FigureView["reviewStatus"], string> = {
  draft: "下書き",
  pending_review: "監修待ち",
  approved: "監修済み",
  rejected: "差し戻し",
};

/**
 * 医学的図解。3 層（画像 / ラベル / 説明）。
 * - patient モード: 承認済みで画像があるときだけ描画。無ければ何も描かない（プレースホルダーを出さない）
 * - admin モード: 状態に関わらず描画し、監修バッジを付ける。画像が無ければ画像領域に「未納品」と表示
 * ラベルは画像に埋め込まず、％座標のアンカーと引き出し線で重ねる。
 */
export function MedicalFigure({ figure, mode }: { figure: FigureView; mode: "patient" | "admin" }) {
  const approved = figure.reviewStatus === "approved" && !!figure.src;
  if (mode === "patient" && !approved) return null;
  const ratio = figure.width && figure.height ? `${figure.width} / ${figure.height}` : "3 / 2";
  const captionId = `figcap-${figure.placementId}`;

  return (
    <figure className="card space-y-3" aria-labelledby={captionId}>
      <div className="relative w-full overflow-hidden rounded-2xl bg-sora" style={{ aspectRatio: ratio }}>
        {figure.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={figure.src} alt={figure.altText} className="absolute inset-0 w-full h-full object-contain" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-ink-soft px-6">
            画像アセット {figure.assetId} は未納品です（管理者プレビュー）
          </div>
        )}
        {figure.labels.length > 0 && (
          <>
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <g stroke="var(--accent)" strokeWidth="0.6" fill="none">
                {figure.labels.map((l) => (
                  <path key={l.id} d={`M${l.anchor.x} ${l.anchor.y}L${l.anchor.x + (l.offset?.x ?? 0)} ${l.anchor.y + (l.offset?.y ?? 18)}`} />
                ))}
              </g>
            </svg>
            {figure.labels.map((l) => (
              <span key={l.id}>
                <i className="fig-anchor" style={{ left: `${l.anchor.x}%`, top: `${l.anchor.y}%` }} aria-hidden />
                <span className="fig-label" style={{ left: `${l.anchor.x + (l.offset?.x ?? 0)}%`, top: `${l.anchor.y + (l.offset?.y ?? 18)}%` }}>
                  {l.text}
                </span>
              </span>
            ))}
          </>
        )}
      </div>
      {figure.labels.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="この図で確認すること">
          {figure.labels.map((l) => (
            <li key={l.id} className="pill text-sm font-bold text-ink">
              <span aria-hidden className="inline-block w-2 h-2 rounded-full bg-accent mr-1.5" />
              {l.text}
            </li>
          ))}
        </ul>
      )}
      {figure.caption && (
        <figcaption id={captionId} className="text-sm text-ink-soft leading-relaxed">
          {figure.caption}
        </figcaption>
      )}
      {figure.longDescription && (
        <details className="text-sm text-ink-soft">
          <summary className="cursor-pointer min-h-11 flex items-center">図の内容を文章で読む</summary>
          <p className="leading-relaxed">{figure.longDescription}</p>
        </details>
      )}
      {mode === "admin" && (
        <div className="rounded-xl bg-bg p-3 text-sm space-y-1">
          <p>
            <span className="font-bold">学習目標:</span> {figure.learningObjective ?? "（未設定）"}
          </p>
          <p className="font-bold">根拠資料:</p>
          {figure.sourceRefs.length === 0 ? (
            <p className="text-ink-soft">（未登録）</p>
          ) : (
            <ul className="list-disc ml-5 text-ink-soft">
              {figure.sourceRefs.map((r, i) => (
                <li key={i}>
                  {r.sourceId}
                  {r.section ? ` ・ ${r.section}` : ""}
                  {r.quote ? `「${r.quote}」` : ""}
                </li>
              ))}
            </ul>
          )}
          {figure.revisionCandidates.length > 0 && (
            <div>
              <p className="font-bold">将来の改訂候補:</p>
              <ul className="list-disc ml-5 text-ink-soft">
                {figure.revisionCandidates.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {figure.reviewNote && (
            <p>
              <span className="font-bold">監修メモ:</span> {figure.reviewNote}
            </p>
          )}
        </div>
      )}
      {mode === "admin" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          <span className={`pill ${figure.reviewStatus === "approved" ? "bg-wakakusa" : "bg-suna"}`}>
            {figure.type === "medical" ? "模式図 ・ " : "挿絵 ・ "}
            {STATUS_LABEL[figure.reviewStatus]}（{figure.assetId} v{figure.version}）
          </span>
          {figure.sourceNote && <span>出典: {figure.sourceNote}</span>}
        </div>
      ) : (
        // 患者向け: 監修情報と出典は折りたたみ（caption の学習上の注意は上で常時表示）
        (figure.type === "medical" || figure.sourceNote) && (
          <details className="text-xs text-ink-soft" data-figure-about>
            <summary className="cursor-pointer min-h-11 flex items-center">図について（監修・出典）</summary>
            <div className="space-y-1 pb-1">
              {figure.type === "medical" && <p>{figure.reviewScopeNote ?? "模式図"}</p>}
              {figure.sourceNote && <p>出典: {figure.sourceNote}</p>}
            </div>
          </details>
        )
      )}
    </figure>
  );
}
