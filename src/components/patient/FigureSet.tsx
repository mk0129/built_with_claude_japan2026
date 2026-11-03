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
export function FigureSet({ figures, mode, layout = "tabs" }: { figures: FigureView[]; mode: "patient" | "admin"; layout?: "tabs" | "stack" }) {
  const visible = mode === "patient" ? figures.filter((f) => f.reviewStatus === "approved" && f.src) : figures;
  const [active, setActive] = useState(0);
  if (visible.length === 0) return null;
  if (visible.length === 1) return <MedicalFigure figure={visible[0]} mode={mode} />;

  // 学習上重要な注意なので常時表示（折りたたまない）。短く、進行順序ではないことを明確に
  const note = (
    <p className="text-sm font-bold text-ink-soft" data-figure-note>
      {visible.length} つの図は別々の情報です。病気が進む順番ではありません。
    </p>
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
