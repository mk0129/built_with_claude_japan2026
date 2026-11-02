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
  /** 納品済みの配信ファイル（public/assets/<type>/ に存在すれば登録し、editorial は公開可として approved にする） */
  delivered?: { filename: string; width: number; height: number };
  /** 根拠資料（監修プレビューに表示） */
  sourceRefs?: { sourceId: string; section?: string; quote?: string }[];
}[] = [
  // 病期の考え方: 3 枚は「順番に進行する段階」ではなく、病期を考えるときに参照する別々の情報
  {
    assetId: "MED-001-01",
    type: "medical",
    altText: "乳房のなかにある原発病変の位置を示す模式図",
    longDescription: "成人女性の片側の乳房を正面から見た端正な模式図。乳房のなかに病変の位置が控えめに示されている。病変は誇張しない。",
    learningObjective: "病期を考える情報のひとつとして、乳房のなかの病変（原発病変）の大きさや位置を確認すると知る",
    placements: [
      {
        materialTitle: "乳がんの診断と病期の考え方",
        slideSeq: 1,
        labels: [
          { id: "primary", text: "乳房内の病変", anchor: { x: 55, y: 70 }, offset: { x: 22, y: 12 } },
          { id: "breast", text: "乳房", anchor: { x: 40, y: 58 }, offset: { x: -18, y: -14 } },
        ],
        caption: "乳房のなかの病変（原発病変）。しこりの大きさや、まわりへの広がりを確認します。",
      },
    ],
    delivered: { filename: "med_001_01_primary_lesion.png", width: 900, height: 900 },
  },
  {
    assetId: "MED-001-02",
    type: "medical",
    altText: "乳房とわきの下の領域リンパ節の位置関係を示す模式図",
    longDescription: "成人女性の上半身の模式図。片側の乳房と、わきの下（腋窩）のリンパ節の位置関係が自然に読み取れる。",
    learningObjective: "病期を考える情報のひとつとして、乳房に近いリンパ節（領域リンパ節）への広がりを確認すると知る",
    placements: [
      {
        materialTitle: "乳がんの診断と病期の考え方",
        slideSeq: 1,
        labels: [
          { id: "breast", text: "乳房内の病変", anchor: { x: 56, y: 70 }, offset: { x: 20, y: 12 } },
          { id: "node", text: "わきの下のリンパ節", anchor: { x: 31, y: 56 }, offset: { x: 0, y: 30 } },
          { id: "clav", text: "鎖骨のあたりのリンパ節", anchor: { x: 45, y: 47 }, offset: { x: 18, y: -16 } },
        ],
        caption: "乳房に近いリンパ節（わきの下や鎖骨のあたりなど）への広がりを確認します。",
      },
    ],
    delivered: { filename: "med_001_02_regional_nodes.png", width: 900, height: 900 },
  },
  {
    assetId: "MED-001-03",
    type: "medical",
    altText: "全身の輪郭のなかで離れた臓器の位置を示す模式図",
    longDescription: "成人女性の全身シルエットの模式図。乳房から離れた臓器（骨・肺・肝臓など）の位置関係を控えめに示す。病変の有無を断定しない。",
    learningObjective: "病期を考える情報のひとつとして、離れた臓器への広がり（転移）の有無を確認すると知る",
    placements: [
      {
        materialTitle: "乳がんの診断と病期の考え方",
        slideSeq: 1,
        labels: [
          { id: "lung", text: "肺", anchor: { x: 62, y: 40 }, offset: { x: 20, y: -12 } },
          { id: "liver", text: "肝臓", anchor: { x: 42, y: 58 }, offset: { x: -24, y: 2 } },
          { id: "bone", text: "骨", anchor: { x: 62, y: 84 }, offset: { x: 20, y: 0 } },
        ],
        caption: "離れた臓器への広がり（転移）の有無を確認します。図の肺・肝臓・骨は例で、これらすべてに広がるという意味ではありません。",
      },
    ],
    delivered: { filename: "med_001_03_distant_spread.png", width: 900, height: 900 },
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
    delivered: { filename: "EDI-001.png", width: 600, height: 541 },
  },
];
