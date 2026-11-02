"use client";
import { useState } from "react";
import type { FigureView } from "@/server/services/figures";
import { MedicalFigure } from "./MedicalFigure";

/**
 * 1 画面に複数の図解があるときの表示。
 * - stack: 縦に並べる
 * - tabs: 1 枚ずつ切り替える（既定）。タブには図の主題を表示し、番号や矢印は付けない
 * 複数のときは「順番や段階を表すものではない」旨を必ず添える。
 */
export function FigureSet({ figures, mode, layout = "tabs", compactNote = false }: { figures: FigureView[]; mode: "patient" | "admin"; layout?: "tabs" | "stack"; compactNote?: boolean }) {
  const visible = mode === "patient" ? figures.filter((f) => f.reviewStatus === "approved" && f.src) : figures;
  const [active, setActive] = useState(0);
  if (visible.length === 0) return null;
  if (visible.length === 1) return <MedicalFigure figure={visible[0]} mode={mode} />;

  // compactNote: 比較案（デザイン検討）用の 1 行表示。既定（false）は従来どおりの注記
  const note = compactNote ? (
    <p className="text-xs text-ink-soft">※ {visible.length} つの図は別々の情報です（順番ではありません）</p>
  ) : (
    <p className="text-sm text-ink-soft">これらの図は、病期を考えるときに確認する別々の情報です。順番や進み方を表すものではありません。</p>
  );
  if (layout === "stack") {
    return (
      <div className="space-y-3">
        {note}
        {visible.map((f) => (
          <MedicalFigure key={f.placementId} figure={f} mode={mode} />
        ))}
      </div>
    );
  }
  const cur = visible[Math.min(active, visible.length - 1)];
  return (
    <div className="space-y-2">
      {note}
      <div role="tablist" aria-label="確認する情報" className="flex flex-wrap gap-1.5">
        {visible.map((f, i) => (
          <button
            key={f.placementId}
            role="tab"
            aria-selected={i === active}
            className={`btn min-h-11 px-4 text-sm ${i === active ? "btn-primary" : ""}`}
            onClick={() => setActive(i)}
          >
            {f.tabLabel ?? f.labels[0]?.text ?? f.assetId}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <MedicalFigure figure={cur} mode={mode} />
      </div>
    </div>
  );
}
