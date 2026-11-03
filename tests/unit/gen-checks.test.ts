import { describe, expect, it } from "vitest";
import { matchMustCover, validateMaterial, type MaterialOutput } from "@/server/services/ai-generation";

const src = [{ id: "s1", extractedText: "1. 目的\n目的の文です。\n2. 副作用\n副作用の文です。急に息苦しくなったら病院へ連絡してください。\n3. 期間\n期間の文です。" }];
const base = (slides: MaterialOutput["slides"], coverage: MaterialOutput["coverage"] = []): MaterialOutput => ({
  title: "t",
  summary: "s",
  primaryDomain: "drug_therapy",
  learningObjectives: ["知る"],
  slides,
  questions: [
    { stem: "q1", options: ["a", "b", "c"], correctIndex: 0, explanation: "e", relatedSlide: 1, sourceRefs: [{ sourceId: "s1", section: "1. 目的", quote: "目的の文です。" }] },
    { stem: "q2", options: ["a", "b", "c"], correctIndex: 1, explanation: "e", relatedSlide: 1, sourceRefs: [{ sourceId: "s1", section: "2. 副作用", quote: "副作用の文です。" }] },
  ],
  notCoveredBySource: [],
  coverage,
});
const slide = (title: string, refs: { section: string; quote: string }[]) => ({ title, proposition: "p", body: "b", detail: "", sourceRefs: refs.map((r) => ({ sourceId: "s1", ...r })) });

describe("GEN-02: 1 画面 1 主題の機械チェック（候補の抽出。判定は医療者）", () => {
  it("1 画面の出典が複数の見出しにまたがると警告する", () => {
    const out = base([
      slide("A", [{ section: "1. 目的", quote: "目的の文です。" }]),
      slide("B", [{ section: "2. 副作用", quote: "副作用の文です。" }, { section: "3. 期間", quote: "期間の文です。" }]),
      slide("C", [{ section: "3. 期間", quote: "期間の文です。" }]),
    ]);
    const v = validateMaterial(out, src);
    expect(v.errors).toEqual([]);
    expect(v.warnings.filter((w) => w.startsWith("画面 2:") && /複数の見出し/.test(w))).toHaveLength(1);
    expect(v.warnings.some((w) => w.startsWith("画面 1:") && /複数の見出し/.test(w))).toBe(false);
  });
  it("同じ見出しからの複数引用は警告しない", () => {
    const out = base([
      slide("A", [{ section: "1. 目的", quote: "目的の文です。" }, { section: "1. 目的", quote: "目的の文です。" }]),
      slide("B", [{ section: "2. 副作用", quote: "副作用の文です。" }]),
      slide("C", [{ section: "3. 期間", quote: "期間の文です。" }]),
    ]);
    expect(validateMaterial(out, src).warnings.some((w) => /複数の見出し/.test(w))).toBe(false);
  });
});

describe("GEN-05: 必須事項の機械照合（参考情報。網羅の最終判断は医療者）", () => {
  const items = [
    { id: "m1", text: "急に息苦しくなったら病院へ連絡する", kind: "emergency" as const, sourceRef: { sourceId: "s1", quote: "急に息苦しくなったら病院へ連絡してください。" }, status: "required" as const },
    { id: "m2", text: "期間は人による", kind: "fact" as const, sourceRef: { sourceId: "s1", quote: "期間の文です。" }, status: "required" as const },
    { id: "m3", text: "別教材", kind: "visit" as const, sourceRef: { sourceId: "s1", quote: "目的の文です。" }, status: "other_material" as const },
  ];
  it("引用が教材の出典と重なる項目だけ autoMatched=true。別教材で扱う項目は照合しない（null）。Claude の申告は coverage に残る", () => {
    const out = base(
      [slide("A", [{ section: "2. 副作用", quote: "急に息苦しくなったら病院へ連絡してください。" }]), slide("B", [{ section: "1. 目的", quote: "目的の文です。" }]), slide("C", [{ section: "1. 目的", quote: "目的の文です。" }])],
      [{ itemId: "m1", slides: [1], questions: [] }, { itemId: "m2", slides: [3], questions: [] }],
    );
    const r = matchMustCover(items, out);
    expect(r.find((i) => i.id === "m1")).toMatchObject({ autoMatched: true, coverage: { slides: [1], questions: [] }, confirmed: null });
    // Claude が「画面 3 で扱った」と申告しても、引用が無ければ autoMatched は false（申告だけで網羅とはしない）
    expect(r.find((i) => i.id === "m2")).toMatchObject({ autoMatched: false, coverage: { slides: [3], questions: [] } });
    expect(r.find((i) => i.id === "m3")?.autoMatched).toBeNull();
  });
  it("短すぎる引用（8 文字未満）は照合しない", () => {
    const out = base([slide("A", [{ section: "1", quote: "目的の文" }]), slide("B", []), slide("C", [])]);
    const r = matchMustCover([{ ...items[1], sourceRef: { sourceId: "s1", quote: "目的の文" } }], out);
    expect(r[0].autoMatched).toBe(false);
  });
});
