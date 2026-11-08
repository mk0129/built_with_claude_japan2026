import { describe, expect, it } from "vitest";
import { checkMaterialQuality, isGenericStem, isObviousDistractor, isSituationalStem, qualityScore, type QualityMaterial } from "@/lib/material-quality";

const good: QualityMaterial = {
  title: "飲み薬の抗がん剤を安全に続けるために",
  slides: [
    { title: "飲み方は決められたとおり", proposition: "飲む量・時間・休む期間は、薬ごとに決まっています。", body: "飲み薬の抗がん剤も、点滴と同じように量と飲み方が決められています。休薬期間がある薬もあります。説明書やカレンダーで予定を確認しながら飲みましょう。", detail: "食前・食後の指定は薬によって違います。" },
    { title: "飲み忘れたとき", proposition: "2 回分をまとめて飲まず、決められた対応に従います。", body: "飲み忘れに気づいても、2 回分をまとめて飲まないでください。対応は薬によって違うため、事前に薬剤師に確認しておきます。迷ったら病院に電話で聞きましょう。", detail: "" },
    { title: "まとめ", body: "決められた飲み方を守り、飲み忘れは 2 回分飲まずに確認します。この内容は一般的な説明です。あなたの治療については、担当医の説明が優先されます。気になることは次の診察で聞いてください。" },
  ],
  questions: [
    { stem: "朝の分を飲み忘れたことに夜気づきました。こういうとき、どうしますか。", options: ["夜に 2 回分をまとめて飲む", "事前に確認した対応に従い、迷えば病院に聞く", "その週の分は全部やめて次の週から再開する"], correctIndex: 1, explanation: "2 回分をまとめて飲まないでください。対応は薬によって違うため、事前の確認か病院への電話で決めます。", relatedSlide: 2 },
    { stem: "体調がよい日が続いています。薬の量について、どう考えますか。", options: ["量と期間は薬ごとに決まっているので、そのまま続ける", "調子がよければ自分で量を減らしてよい", "休薬期間は体調がよければ飛ばしてよい"], correctIndex: 0, explanation: "量・時間・休薬期間は薬ごとに決まっています。体調で自己判断せず、変えたいときは医療者に相談します。", relatedSlide: 1 },
    { stem: "休薬期間の数え方がわからなくなりました。どこで確かめますか。", options: ["薬の説明書やカレンダーで確認し、わからなければ薬剤師に聞く", "家族の記憶で決める", "次の診察まで飲まずに待つ"], correctIndex: 0, explanation: "予定は説明書やカレンダーで確認できます。迷ったときは薬剤師や病院に聞きます。", relatedSlide: 1 },
  ],
};

describe("教材の品質チェック", () => {
  it("規約に沿った教材は注意が少ない", () => {
    const issues = checkMaterialQuality(good);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.map((i) => i.code)).not.toContain("Q_NO_SITUATIONAL");
    expect(qualityScore(issues)).toBeGreaterThanOrEqual(88);
  });
  it("正答だけが長い・明らかな誤答・位置の偏りを見つける", () => {
    const bad: QualityMaterial = {
      ...good,
      questions: [
        { stem: "飲み薬について正しいものはどれですか。", options: ["気にしない", "飲む量・時間・休む期間は薬ごとに決まっていて、説明書で確認する", "血液型で決まる"], correctIndex: 1, explanation: "説明書で確認します。薬ごとに決まっています。", relatedSlide: 1 },
        { stem: "飲み忘れについて正しいものはどれですか。", options: ["何もしない", "2 回分をまとめて飲まず、事前に確認した対応に従う", "関係ない"], correctIndex: 1, explanation: "2 回分をまとめて飲まないでください。対応は薬ごとに違います。", relatedSlide: 2 },
        { stem: "保管について正しいものはどれですか。", options: ["放置する", "子どもやペットの手の届かない場所に保管し、指示なく砕かない", "無視する"], correctIndex: 1, explanation: "手の届かない場所に保管し、指示がない限り割ったり砕いたりしません。", relatedSlide: 1 },
      ],
    };
    const codes = checkMaterialQuality(bad).map((i) => i.code);
    expect(codes).toContain("Q_CORRECT_LONGEST");
    expect(codes).toContain("Q_OBVIOUS_DISTRACTOR");
    expect(codes).toContain("Q_POSITION_SAME");
    expect(codes).toContain("Q_NO_SITUATIONAL");
    expect(codes).toContain("Q_ALL_GENERIC");
  });
  it("画面の量と、まとめ・行動の文を見る", () => {
    const m: QualityMaterial = {
      title: "t",
      slides: [
        { title: "a", proposition: "要点です。", body: "短い。", detail: "" },
        { title: "b", proposition: "これはとても長い要点で、四十五文字という目安をはるかに超えてしまっているので、注意が出るはずの文章になっています。", body: "一文がとても長くて六十文字をゆうに超えてしまうように書かれているため、読む人にとっては一息で読み切れない長さになってしまっています。", detail: "" },
        { title: "c", body: "まとめの文だけ。" },
      ],
      questions: [
        { stem: "q", options: ["a", "b", "c"], correctIndex: 0, explanation: "解説が短い", relatedSlide: 9 },
        { stem: "q2", options: ["a", "b", "わからない"], correctIndex: 3, explanation: "解説が短い", relatedSlide: 1 },
      ],
    };
    const issues = checkMaterialQuality(m);
    const codes = issues.map((i) => i.code);
    for (const c of ["BODY_SHORT", "PROPOSITION_LONG", "SENTENCE_LONG", "CLOSING_MISSING", "ACTION_MISSING", "Q_RELATED_SLIDE", "Q_EXPLANATION_LENGTH"]) expect(codes).toContain(c);
    expect(issues.filter((i) => i.level === "error").map((i) => i.code)).toEqual(expect.arrayContaining(["Q_UNKNOWN_OPTION", "Q_CORRECT_INDEX"]));
  });
  it("内部コードは誤りにする", () => {
    const m: QualityMaterial = { ...good, slides: [{ ...good.slides[0], body: "この教材の領域は drug_therapy です。説明書やカレンダーで予定を確認し、迷ったら薬剤師に聞きましょう。" }, ...good.slides.slice(1)] };
    expect(checkMaterialQuality(m).some((i) => i.code === "INTERNAL_CODE" && i.level === "error")).toBe(true);
  });
  it("設問の型と誤答の判定", () => {
    expect(isSituationalStem("朝の分を飲み忘れたことに夜気づきました。こういうとき、どうしますか。")).toBe(true);
    expect(isSituationalStem("箸やボタンの操作がしにくくなってきたときの正しい対応はどれですか。")).toBe(true);
    expect(isSituationalStem("ホルモン療法について正しいものはどれですか。")).toBe(false);
    expect(isGenericStem("ホルモン療法について正しいものはどれですか。")).toBe(true);
    expect(isGenericStem("発熱に気づいたとき、連絡の前にしないほうがよいことはどれですか。")).toBe(false);
    expect(isObviousDistractor("気にしない")).toBe(true);
    expect(isObviousDistractor("症状がなければやめてよい")).toBe(false);
  });
});
