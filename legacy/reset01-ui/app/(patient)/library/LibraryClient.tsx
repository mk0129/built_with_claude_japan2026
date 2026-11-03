"use client";
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/reset/Icons";
import { LevelChip, PhaseChip, nextHref } from "@/components/reset/Status";
import { estimateMinutes, fmtDate } from "@/lib/labels";
import { DOMAIN_JOURNEY, domainMap, type Level, type Phase } from "@/lib/understanding";

export type LibraryRow = {
  materialId: string;
  versionId: string;
  title: string;
  summary: string | null;
  primaryDomain: string;
  ownerOrgName: string | null;
  slideCount: number;
  questionCount: number;
  prescribedAt: string | null;
  prescribedLatest: boolean;
  selfLearning: boolean;
  phase: Phase;
  lastSlideSeq: number;
  level: Level;
};

const FILTERS = [
  { key: "all", label: "すべて" },
  { key: "rx", label: "処方された" },
  { key: "todo", label: "まだ終えていない" },
  { key: "review", label: "もう一度" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function match(r: LibraryRow, f: FilterKey) {
  if (f === "rx") return !!r.prescribedAt;
  if (f === "todo") return r.phase !== "completed";
  if (f === "review") return r.level === "review";
  return true;
}

export function LibraryClient({ rows }: { rows: LibraryRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const map = domainMap(rows.filter((r) => r.prescribedAt || r.selfLearning).map((r) => ({ primaryDomain: r.primaryDomain, level: r.level, phase: r.phase, prescribed: !!r.prescribedAt })));
  const shown = rows.filter((r) => match(r, filter));
  return (
    <>
      <div className="rs-filter" role="group" aria-label="絞り込み">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
            {f.key !== "all" ? `（${rows.filter((r) => match(r, f.key)).length}）` : ""}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="rs-muted mt-4">この条件に当てはまる教材はありません。</p>}
      {DOMAIN_JOURNEY.map((domain, idx) => {
        const list = shown
          .filter((r) => r.primaryDomain === domain)
          .sort((a, b) => Number(b.prescribedLatest) - Number(a.prescribedLatest) || Number(!!b.prescribedAt) - Number(!!a.prescribedAt));
        if (list.length === 0) return null;
        const cell = map.find((c) => c.domain === domain)!;
        return (
          <section key={domain} id={`d-${domain}`} aria-labelledby={`h-${domain}`} className="scroll-mt-16">
            <div className="rs-domain-head">
              <h2 id={`h-${domain}`}>
                <span className="step">{String(idx + 1).padStart(2, "0")}</span>
                {cell.label}
              </h2>
              {cell.total > 0 && <LevelChip level={cell.level} />}
            </div>
            <ul className="rs-small-card" aria-label={`${cell.label}の教材`}>
              {list.map((r) => (
                <li key={r.materialId}>
                  <Link href={nextHref(r)} className="rs-lib-row" data-testid="library-row">
                    <div className={`rs-mini-icon ${r.prescribedLatest && r.phase !== "completed" ? "coral" : ""}`}>
                      <Icon name={r.phase === "completed" ? "checkcircle" : "book"} />
                    </div>
                    <div className="rs-item-info">
                      <div className="rs-item-title">{r.title}</div>
                      <div className="rs-item-sub">
                        約{estimateMinutes(r.slideCount, r.questionCount)}分 ・ {r.slideCount}画面{r.ownerOrgName ? ` ・ ${r.ownerOrgName}` : ""}
                      </div>
                      <div className="badges">
                        {r.prescribedLatest && <span className="rs-badge rx">今回の処方</span>}
                        {r.prescribedAt && !r.prescribedLatest && <span className="rs-badge">処方 {fmtDate(r.prescribedAt)}</span>}
                        {r.selfLearning && <span className="rs-badge self">自分で学習</span>}
                      </div>
                    </div>
                    <div className="right">
                      <PhaseChip phase={r.phase} lastSlideSeq={r.lastSlideSeq} slideCount={r.slideCount} />
                      {r.phase === "completed" && <LevelChip level={r.level} />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
