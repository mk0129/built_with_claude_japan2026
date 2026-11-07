import { describe, expect, it } from "vitest";
import { reviewDraft, textSimilarity } from "@/concept-d/studio";
import replay from "../../.judge-demo/app/fixtures/studio-replay.json";
import { SOURCE_TEXT } from "../../.judge-demo/app/fixtures/studio-source";

/** 記録済みの Claude 出力（審査デモ）を、編集画面と同じ下書きの形にする。出力の内容は変えない */
function recordedDraft() {
  const m = replay.material;
  return {
    slides: m.slides.map((s, i) => ({ seq: i + 1, title: s.title, proposition: s.proposition, bodyMd: s.body, detailMd: s.detail, sourceRefs: s.sourceRefs })),
    questions: m.questions.map((q, i) => ({
      seq: i + 1,
      stem: q.stem,
      options: q.options as [string, string, string],
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      relatedSlideSeq: q.relatedSlide,
      sourceRefs: q.sourceRefs,
    })),
    version: { mustCover: replay.outline.mustCoverCandidates.map((c, i) => ({ id: `mc${i + 1}`, text: c.text, kind: c.kind, status: "required", sourceRef: c.sourceRef })) },
  };
}

describe("教材スタジオ: 公開前の自動チェック（記録済み出力は書き換えない）", () => {
  it("前回の照合で見つかった欠落を、本文と設問の両方から警告する", () => {
    const draft = recordedDraft();
    const before = JSON.stringify(draft);
    const checks = reviewDraft(draft, { sourceText: SOURCE_TEXT });
    expect(JSON.stringify(draft)).toBe(before);
    const titles = checks.map((c) => `${c.title} @ ${c.where}`);
    // 1. 血栓の症状の連絡指示が「もう少し詳しく」の中だけ（問5はこの画面を参照）
    expect(titles).toContainEqual(expect.stringMatching(/「次の診察を待たず」.*もう少し詳しく.*画面4.*問5/));
    expect(titles).toContainEqual(expect.stringMatching(/「夜間や休日」.*もう少し詳しく.*画面4/));
    // 2. 「手術のあとに」の欠落（本文の画面1と、設問の問1）
    expect(titles).toContainEqual(expect.stringMatching(/「手術のあと」が抜けています @ 画面1/));
    expect(titles).toContainEqual(expect.stringMatching(/「手術のあと」が抜けています @ 問1/));
    // 3. 「治療を始める前に担当医に相談」の欠落
    expect(checks.some((c) => c.title.includes("治療を始める前") && c.excerpt.includes("将来の妊娠"))).toBe(true);
    // 4. 患者向けの文の「原資料では」（問1・問2の解説）
    expect(checks.filter((c) => c.kind === "source_word").map((c) => c.where)).toEqual(["問1の解説", "問2の解説"]);
    // 安全に関わる指摘が先に並ぶ
    expect(checks[0].kind).toBe("detail_only");
    // 本文に条件がある箇所（画面3「手術のあとのホルモン療法は」）は指摘しない
    expect(titles.some((t) => t.includes("画面3"))).toBe(false);
  });

  it("医療者が本文を直すと、該当の指摘が消える", () => {
    const draft = recordedDraft();
    draft.slides[0].bodyMd = `手術のあとに行う治療です。${draft.slides[0].bodyMd}`;
    draft.slides[3].bodyMd += "片方の足が急に腫れる・痛むときは、次の診察を待たずに病院へ連絡します。夜間や休日は案内された連絡先に電話します。";
    draft.questions[0].explanation = draft.questions[0].explanation.replace("原資料では、", "手術のあとのホルモン療法は、");
    const checks = reviewDraft(draft, { sourceText: SOURCE_TEXT });
    expect(checks.some((c) => c.kind === "detail_only")).toBe(false);
    expect(checks.some((c) => c.title.includes("手術のあと"))).toBe(false);
    expect(checks.filter((c) => c.kind === "source_word").map((c) => c.where)).toEqual(["問2の解説"]);
  });

  it("原資料の本文がないとき（本番のクライアント）は、出典の引用で照合する", () => {
    const checks = reviewDraft(recordedDraft());
    expect(checks.some((c) => c.kind === "detail_only")).toBe(true);
    expect(checks.some((c) => c.kind === "source_word")).toBe(true);
  });

  it("文字 bigram の類似度", () => {
    expect(textSimilarity("次の診察を待たずに連絡", "次の診察を待たずに連絡")).toBe(1);
    expect(textSimilarity("", "あ")).toBe(0);
    expect(textSimilarity("手術のあと", "飲み忘れ")).toBe(0);
  });
});
