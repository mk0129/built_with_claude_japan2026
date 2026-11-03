import { describe, expect, it } from "vitest";
import { domainMap, domainNote, levelOf } from "@/lib/understanding";

describe("理解度の 3 段階", () => {
  it("最新の完了挑戦に誤答・わからないがあれば「もう一度」、全問正解なら「確認できた」、未完了は「未学習」", () => {
    expect(levelOf(null)).toBe("none");
    expect(levelOf({ attemptId: null, nWrong: 0, nUnknown: 0 })).toBe("none");
    expect(levelOf({ attemptId: "a", nWrong: 0, nUnknown: 0 })).toBe("ok");
    expect(levelOf({ attemptId: "a", nWrong: 0, nUnknown: 1 })).toBe("review");
    expect(levelOf({ attemptId: "a", nWrong: 1, nUnknown: 0 })).toBe("review");
  });

  it("領域の地図は治療の流れの順に 6 領域。1 つでも「もう一度」があれば領域も「もう一度」", () => {
    const m = domainMap([
      { primaryDomain: "diagnosis_staging", level: "ok", phase: "completed", prescribed: true },
      { primaryDomain: "diagnosis_staging", level: "review", phase: "completed", prescribed: true },
      { primaryDomain: "drug_therapy", level: "ok", phase: "completed", prescribed: false },
      { primaryDomain: "side_effects_daily_life", level: "none", phase: "reading", prescribed: true },
    ]);
    expect(m.map((c) => c.domain)).toEqual(["diagnosis_staging", "surgery", "drug_therapy", "radiation", "side_effects_daily_life", "mental_care_support"]);
    expect(m[0]).toMatchObject({ level: "review", total: 2, completed: 2, review: 1, prescribed: 2 });
    expect(m[1]).toMatchObject({ level: "none", total: 0 });
    expect(m[2]).toMatchObject({ level: "ok", prescribed: 0 });
    expect(m[4]).toMatchObject({ level: "none", inProgress: 1 });
    expect(domainNote(m[1])).toBe("まだ学習なし");
    expect(domainNote(m[4])).toBe("1教材中 0完了 ・ 途中 1");
  });
});
