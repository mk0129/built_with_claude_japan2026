import type { FigureLabel } from "./schema";

/**
 * 優先アセット 5 点のメタデータ（VISUAL_ASSET_SPECS_5.md / ASSET_MANIFEST.csv）。
 * 画像は未納品（filename null）。監修前なので患者には配信されない。ラベル座標は納品後に調整する。
 */
export const SEED_FIGURES: {
  assetId: string;
  type: "medical" | "editorial";
  altText: string;
  longDescription: string;
  learningObjective: string;
  placements: { materialTitle: string; slideSeq: number; labels: FigureLabel[]; caption: string | null }[];
}[] = [
  {
    assetId: "MED-001",
    type: "medical",
    altText: "乳房周囲とわきの下の位置関係を示す乳がんの模式図",
    longDescription: "成人女性の上半身の模式図。片側の乳房の位置と、わきの下のリンパ節の位置が読み取れる。小さな全身の輪郭で、離れた臓器との位置関係を控えめに示す。",
    learningObjective: "病期を考えるには、乳房内の病変だけでなく、近くのリンパ節や離れた場所への広がりを確認すると知る",
    placements: [
      {
        materialTitle: "乳がんの診断と病期の考え方",
        slideSeq: 1,
        labels: [
          { id: "breast", text: "乳房内の病変", anchor: { x: 38, y: 58 }, offset: { x: -14, y: 22 } },
          { id: "node", text: "近くのリンパ節", anchor: { x: 52, y: 40 }, offset: { x: 10, y: -30 } },
          { id: "distant", text: "離れた場所への広がり", anchor: { x: 84, y: 62 }, offset: { x: -4, y: 20 } },
        ],
        caption: "病期を考えるときは、乳房のなかの病変だけでなく、近くのリンパ節や、離れた場所への広がりも確認します。",
      },
    ],
  },
  {
    assetId: "MED-002",
    type: "medical",
    altText: "薬物療法や医療者との相談など治療に関連する場面のイラスト",
    longDescription: "医療者との相談、点滴の治療、病院の環境、診察後の自宅での日常など、治療に関わる場面を余白をもって描いた一枚。順序は画面側で示す。",
    learningObjective: "治療の組み合わせや順番は一人ひとり異なり、医療者が個別に説明すると知る",
    placements: [{ materialTitle: "薬物療法の種類（化学療法・ホルモン療法・分子標的）", slideSeq: 1, labels: [], caption: "治療の組み合わせや順番は人によって違います。あなたの治療の流れは担当医が説明します。" }],
  },
  {
    assetId: "MED-003",
    type: "medical",
    altText: "自宅で気になる症状について病院に電話で相談する女性のイラスト",
    longDescription: "自宅で体調を気にしている成人女性が、手元のスマートフォンと説明カードを見ている。少し離れて電話を受ける医療者の姿がある。",
    learningObjective: "気になる症状を一人で抱え込まず、案内された連絡方法を確認して相談につなげられると知る",
    placements: [
      {
        materialTitle: "化学療法中の副作用とセルフケア",
        slideSeq: 4,
        labels: [
          { id: "notice", text: "症状に気づく", anchor: { x: 30, y: 50 } },
          { id: "check", text: "連絡先を確認する", anchor: { x: 50, y: 70 } },
          { id: "call", text: "医療者に相談する", anchor: { x: 80, y: 40 } },
        ],
        caption: "気になる症状があるときは、病院から案内された連絡方法を確認して相談します。",
      },
    ],
  },
  {
    assetId: "MED-004",
    type: "medical",
    altText: "患者が医療者や相談員と落ち着いて話をするイラスト",
    longDescription: "落ち着いた室内で、成人の患者と、話を聴く医療者または相談員が同じ目の高さで向かい合っている。",
    learningObjective: "気持ちや生活の悩みを話せる相手には複数の選択肢があり、相談先を選べると知る",
    placements: [{ materialTitle: "こころのケアと相談先", slideSeq: 2, labels: [], caption: "担当医や看護師のほか、がん相談支援センターなどにも相談できます。" }],
  },
  {
    assetId: "EDI-001",
    type: "editorial",
    altText: "窓辺で静かに過ごす女性のイラスト",
    longDescription: "穏やかな住まいの窓辺で、成人女性が椅子に座りマグカップと本を手にしている。",
    learningObjective: "医学的知識は説明しない。アプリに戻る心理的な抵抗を下げる",
    placements: [],
  },
];
