import { describe, expect, it } from "vitest";
import { answerStats, ruleCandidates, rxStatus, symptomStat, symptomTerms } from "@/concept-d/clinician-summary";

const at = (d: string, t = "08:00") => new Date(`2026-${d}T${t}:00`).toISOString();

describe("診察サマリー: 症状の最大・直近", () => {
  it("最大値の最初の日・同じ値のほかの日数・直近の値と日付・生活への影響を記録どおりに返す", () => {
    const st = symptomStat([
      { at: at("10-30"), severity: 3, sourceId: "c" },
      { at: at("10-28", "08:22"), severity: 3, sourceId: "a", interference: "ボタンを留めにくい" },
      { at: at("10-28", "21:05"), severity: 3, sourceId: "b" },
      { at: at("11-03"), severity: 1, sourceId: "d" },
    ])!;
    expect(st.max).toBe(3);
    expect(new Date(st.peakAt).getDate()).toBe(28);
    // 10/28 の 2 回は同じ日として数える（ほか 1 日 = 10/30）
    expect(st.peakOtherDays).toBe(1);
    expect(st.last.severity).toBe(1);
    expect(new Date(st.last.at).getDate()).toBe(3);
    expect(st.count).toBe(4);
    expect(st.impacts).toEqual([{ at: at("10-28", "08:22"), text: "ボタンを留めにくい" }]);
  });
  it("記録がなければ null（欠測を 0 にしない）", () => {
    expect(symptomStat([])).toBeNull();
  });
});

describe("診察サマリー: 回答の分母", () => {
  it("回答した設問の数を分母に、正答・誤答・「わからない」を分けて数える", () => {
    const s = answerStats([
      { sourceId: "1", result: "正答", stem: "a", at: "", title: "T" },
      { sourceId: "2", result: "誤答", stem: "b", at: "", title: "T" },
      { sourceId: "3", result: "わからない", stem: "c", at: "", title: "T" },
      { sourceId: "4", result: "正答", stem: "d", at: "", title: "T" },
      { sourceId: "5", result: "正答", stem: "e", at: "", title: "T" },
    ]);
    expect(s).toEqual({ answered: 5, correct: 3, wrong: 1, unknown: 1 });
  });
});

describe("診察サマリー: 規則による教材候補", () => {
  const library = [
    { id: "m1", title: "化学療法中の副作用とセルフケア", searchText: "よくある副作用の観察点 吐き気" },
    { id: "m2", title: "薬物療法の種類", searchText: "それぞれの薬の目的" },
    { id: "m3", title: "手術後の生活と気をつけること", searchText: "創部ケア" },
  ];
  it("本人の質問に対応する教材を、理由つきで先頭に出す", () => {
    const c = ruleCandidates({
      library,
      questions: [{ sourceId: "fb:1", body: "吐き気止めはいつ飲みますか", materialTitle: "化学療法中の副作用とセルフケア", input: "free_text" }],
      answers: [{ sourceId: "qa:1", result: "わからない", stem: "分子標的薬を使うのは", at: "", title: "薬物療法の種類" }],
      symptoms: [],
    });
    expect(c.map((x) => x.id)).toEqual(["m1", "m2"]);
    expect(c[0].reasons[0]).toEqual({ kind: "question", text: "質問「吐き気止めはいつ飲みますか」がこの教材から残された" });
    expect(c[1].reasons[0].text).toContain("「わからない」と回答");
  });
  it("症状名の語が教材の説明に含まれるときだけ症状から候補にする（1/4 以上のみ）", () => {
    const c = ruleCandidates({
      library,
      questions: [],
      answers: [],
      symptoms: [
        { key: "nausea", name: "吐き気", max: 2 },
        { key: "rash", name: "皮疹・発疹", max: 3 },
        { key: "fatigue", name: "だるさ", max: 0 },
      ],
    });
    expect(c).toHaveLength(1);
    expect(c[0].id).toBe("m1");
    expect(c[0].reasons[0]).toEqual({ kind: "symptom", text: "症状「吐き気」（最大 2/4）と、教材の説明の「吐き気」が一致" });
  });
  it("根拠がなければ候補なし。承認済み一覧にない教材（未承認・非公開）は出さない", () => {
    expect(ruleCandidates({ library, questions: [], answers: [], symptoms: [] })).toEqual([]);
    const c = ruleCandidates({
      library,
      questions: [{ sourceId: "fb:2", body: "下書きの教材の質問", materialTitle: "ホルモン療法の目的と続け方", input: "free_text" }],
      answers: [{ sourceId: "qa:2", result: "誤答", stem: "x", at: "", title: "ホルモン療法の目的と続け方" }],
      symptoms: [],
    });
    expect(c).toEqual([]);
  });
  it("正答は候補の理由にしない。同じ教材の理由はまとめ、件数を上限で切る", () => {
    const c = ruleCandidates({
      library,
      questions: [
        { sourceId: "fb:1", body: "質問A", materialTitle: "薬物療法の種類", input: "free_text" },
        { sourceId: "fb:2", body: "", materialTitle: "薬物療法の種類", input: "selection", selectionLabel: "もう一度説明してほしい" },
      ],
      answers: [{ sourceId: "qa:1", result: "正答", stem: "y", at: "", title: "手術後の生活と気をつけること" }],
      symptoms: [],
      limit: 1,
    });
    expect(c).toHaveLength(1);
    expect(c[0].reasons.map((r) => r.text)).toEqual(["質問「質問A」がこの教材から残された", "この教材に「もう一度説明してほしい」と回答"]);
  });
  it("症状名を照合する語に分ける", () => {
    expect(symptomTerms("だるさ・倦怠感")).toEqual(["だるさ", "倦怠感"]);
    expect(symptomTerms("手足のしびれ")).toEqual(["手足のしびれ"]);
  });
});

describe("教材の処方状況", () => {
  it("この診察で処方済み・今回選択中・前回処方済み（日付）・未処方を区別する", () => {
    expect(rxStatus({ id: "a", prescribedNow: true }, ["a"]).map((x) => x.text)).toEqual(["この診察で処方済み"]);
    expect(rxStatus({ id: "a", prescribedBefore: true, prescribedAt: at("10-25") }, ["a"]).map((x) => x.text)).toEqual([
      "今回選択中",
      "前回処方済み（10月25日）",
    ]);
    expect(rxStatus({ id: "b", prescribedBefore: true, prescribedAt: null }, []).map((x) => x.text)).toEqual(["前回処方済み"]);
    expect(rxStatus({ id: "c" }, []).map((x) => x.text)).toEqual(["未処方"]);
    expect(rxStatus({ id: "c" }, ["c"]).map((x) => x.text)).toEqual(["今回選択中"]);
  });
});
