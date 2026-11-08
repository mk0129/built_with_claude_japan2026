/**
 * 教材カードのサムネイル（Phase 2 Step 5）。完成画像を public/thumbnails/ に置き、ここに登録すると Figma のレイアウトのまま表示する。
 * 登録がない教材は、色面とアイコンだけの小さな代替表示（「画像準備中」の文字は出さない）。一覧・必要サイズ: docs/design/phase2/step5/thumbnails.md
 *
 * サムネイルは雰囲気を伝える一般的なイラスト（医学的な内容を含めない）。体の仕組み・手技などの医学的な解説図は
 * 別の仕組み（figure_assets・図解の監修）で扱い、医療者の内容確認（承認）後にだけ学習画面に表示する。
 * 教材 ID はデータベースごとに異なるため、シードの教材名をキーにする。
 */
/** band: 主題が中央の横長の帯（1600×470）に収まる線画。教材の詳細の横長の枠では帯に合わせて切り抜く（cover）。指定なしは画像全体を表示（contain） */
export type Thumbnail = { file: string; alt: string; band?: true };

export const THUMBNAILS: Record<string, Thumbnail> = {
  // 教材 v1.1（編集草稿・医学的監修前。題名は DB の教材名と完全一致）。線画 #315E68・1600×1200・透過 WebP
  "乳がんの治療は、どう組み合わせて決める？": { file: "thumb_treatment_choices.webp", alt: "医療者と患者が相談する線画" },
  // 病理: 装飾用。ボードの絵は顕微鏡のモチーフ（病理組織・リンパ節の図は描かない。scripts/review/edit-pathology-thumb.mjs）
  "手術後の病理検査では、何がわかる？": { file: "thumb_pathology.webp", alt: "顕微鏡の絵を見ながら医療者の説明を聞く線画" },
  "抗がん剤治療で気をつけたい体調の変化": { file: "thumb_symptom_check.webp", alt: "自宅で体調を記録する線画" },
  "子どもに乳がんをどう伝える？": { file: "thumb_family_talk.webp", alt: "家族と向き合って会話する線画" },
  // 既存のシード教材: 題材が一致するものだけ（化学療法中の体調の変化と自宅での記録）
  "化学療法中の副作用とセルフケア": { file: "thumb_symptom_check.webp", alt: "自宅で体調を記録する線画" },
  // 診断時セットの 3 教材（Codex 制作の正式画像・2026-11-06。単色の連続線画 #315E68・透明背景・1600×1200。docs/design/final_assets/manifest.json）
  "乳がんの診断と病期の考え方": { file: "thumb_diagnosis_staging.webp", alt: "開いたノートとペンの線画", band: true },
  "サブタイプと治療方針のつながり": { file: "thumb_subtypes_treatment.webp", alt: "書類と虫めがねの線画", band: true },
  "こころのケアと相談先": { file: "thumb_emotional_support.webp", alt: "向かい合う 2 つの椅子の線画", band: true },
  // 社会制度の 4 教材（2026-11 登録。Codex 制作の線画・透過 WebP）
  "治療と仕事を両立するために": { file: "thumb_work_treatment.webp", alt: "机と書類と医療者の線画" },
  "傷病手当金を知る": { file: "thumb_sickness_allowance.webp", alt: "カレンダーと封筒の線画" },
  "高額療養費制度を知る": { file: "thumb_high_cost_medical.webp", alt: "領収書と上限の線画" },
  "困ったときの相談先": { file: "thumb_support_contacts.webp", alt: "相談窓口の線画" },
  // 2026-11-08 一括制作の 22 点（Codex 制作・単色の連続線画 #315E68・透明背景・1600×1200。主題は中央の帯に収まる設計なので band）。
  // 一覧と配置: docs/design/illustration_batch_20261108/（README.md・delivery_manifest.json）。題名は DB の教材名と完全一致
  "大腸がんの診断と病期": { file: "thumb_colorectal_staging.webp", alt: "机の上の開いた手帳とマグカップの線画", band: true },
  "肺がんの検査と遺伝子・バイオマーカー検査": { file: "thumb_lung_biomarker.webp", alt: "窓辺の椅子と観葉植物の線画", band: true },
  "セカンドオピニオンの受け方": { file: "thumb_second_opinion.webp", alt: "封筒と一輪の花の線画", band: true },
  "手術前の準備（禁煙・口腔ケア・体力づくり）": { file: "thumb_prehab.webp", alt: "歩きやすい靴とタオルの線画", band: true },
  "胃・大腸の手術のあとの食事": { file: "thumb_post_surgery_diet.webp", alt: "小さな器とれんげの線画", band: true },
  "免疫チェックポイント阻害薬の治療と注意する症状": { file: "thumb_immunotherapy.webp", alt: "リクライニングチェアと本の線画", band: true },
  "飲み薬の抗がん剤を安全に続けるために": { file: "thumb_oral_anticancer.webp", alt: "ピルケースと手帳の線画", band: true },
  "手術の前後に行う薬物療法の目的": { file: "thumb_perioperative_therapy.webp", alt: "カレンダーとペンの線画", band: true },
  "放射線治療の種類と部位ごとの副作用": { file: "thumb_radiation_types.webp", alt: "玄関のカーディガンと小さなバッグの線画", band: true },
  "痛みをやわらげる放射線治療（緩和照射）": { file: "thumb_palliative_radiation.webp", alt: "ベッドサイドのランプと水の線画", band: true },
  "発熱したときの対応（白血球が減っている時期）": { file: "thumb_fever_response.webp", alt: "体温計とスマートフォンの線画", band: true },
  "手足のしびれ（末梢神経障害）とのつきあい方": { file: "thumb_neuropathy.webp", alt: "厚手の手袋とスリッパの線画", band: true },
  "口内炎・味覚の変化と食事の工夫": { file: "thumb_mouth_taste.webp", alt: "歯ブラシとコップの線画", band: true },
  "脱毛と外見のケア（アピアランスケア）": { file: "thumb_appearance_care.webp", alt: "帽子とスカーフの線画", band: true },
  "家族や子どもに病気をどう伝えるか": { file: "thumb_family_children.webp", alt: "ソファと絵本の線画", band: true },
  "緩和ケアは早い時期から": { file: "thumb_palliative_care.webp", alt: "向かい合う椅子と小さなテーブルの線画", band: true },
  "乳房の手術の種類と選び方": { file: "thumb_surgery_choice.webp", alt: "テーブルの上の二つのカップとノートの線画", band: true },
  "手術後の生活と気をつけること": { file: "thumb_after_surgery.webp", alt: "タオルとハンドクリームの線画", band: true },
  "薬物療法の種類（化学療法・ホルモン療法・分子標的）": { file: "thumb_drug_therapy.webp", alt: "手帳と鉛筆とお茶の線画", band: true },
  "放射線治療の進め方と皮膚のケア": { file: "thumb_radiation.webp", alt: "保湿クリームとやわらかい衣類の線画", band: true },
  "さくら総合病院 外来化学療法室のご案内": { file: "thumb_sakura_chemo_room.webp", alt: "待合の椅子と観葉植物の線画", band: true },
  "さくら総合病院 術後リンパ浮腫外来": { file: "thumb_sakura_lymph.webp", alt: "受付カウンターの小さな植物の線画", band: true },
};

export function thumbnailFor(title: string): { src: string; alt: string; band?: true } | null {
  const t = THUMBNAILS[title];
  return t ? { src: `/thumbnails/${t.file}`, alt: t.alt, ...(t.band ? { band: true as const } : {}) } : null;
}

/**
 * 情報処方セットのカバー画像（患者ホームのセットカード・セット詳細）。
 * 正式な画像ができたら public/covers/ に置き、患者向けのセット名（learning.ts の patientSetName の結果。例: 「診断時セット」）をキーに登録する。
 *   例: "診断時セット": { file: "cover_diagnosis.webp", alt: "診断時セットのカバー" },
 * 推奨: 縦長 4:5（例 800×1000）・WebP。医学的な内容を含めない雰囲気のイラストにする。
 * 登録がないセットは、色面と線の装飾だけの代替カバーを表示する（Figma の SetCover と同じ考え方）。
 */
export const SET_COVERS: Record<string, Thumbnail> = {
  // Codex 制作の正式画像（2026-11-06。単色の連続線画 #315E68・透明背景・800×1000）
  "診断時セット": { file: "cover_diagnosis_set.webp", alt: "開いた本から道がつづく線画" },
  "仕事とお金のこと": { file: "cover_work_money.webp", alt: "開いた本とカードの線画" },
  // 2026-11-08 一括制作の 6 点（Codex 制作・単色の連続線画 #315E68・透明背景・800×1000）。キーは患者向けのセット名
  // （patientSetName の結果。これらはテンプレート名と同じ）。docs/design/illustration_batch_20261108/
  "術前セット": { file: "cover_preop_set.webp", alt: "テーブルの上の二つのカップと開いたノートの線画" },
  "化学療法開始時セット": { file: "cover_chemo_start_set.webp", alt: "手帳とカレンダーとお茶の線画" },
  "さくら総合病院 化学療法オリエンテーション": { file: "cover_sakura_chemo_orientation.webp", alt: "待合の椅子と観葉植物と窓の線画" },
  "術前準備セット": { file: "cover_prehab_set.webp", alt: "歩きやすい靴とタオルと水のボトルの線画" },
  "免疫療法開始時セット": { file: "cover_immunotherapy_set.webp", alt: "リクライニングチェアと本とひざ掛けの線画" },
  "化学療法の副作用対策セット": { file: "cover_side_effect_care_set.webp", alt: "帽子・手袋・歯ブラシ・体温計が並ぶ棚の線画" },
};

export function setCoverFor(name: string): { src: string; alt: string } | null {
  const c = SET_COVERS[name];
  return c ? { src: `/covers/${c.file}`, alt: c.alt } : null;
}

/** 画像がないときの代替表示の色（名前から安定して決める。Figma の assetTone と同じ 6 色） */
export function toneFor(key: string): number {
  return [...key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 6;
}

/**
 * テーマ・ツールの画像（患者ホームの「仕事とお金のこと」のカード、医療費シミュレーターのカード）。
 * 正式な画像は public/covers/ に置き、キー（"仕事とお金のこと" / "医療費シミュレーター"）で登録する。登録がなければ代替表示。
 * 「仕事とお金のこと」のカバーはセットと同じ SET_COVERS（セット名と同じキー）にも登録できる。
 */
export const THEME_IMAGES: Record<string, Thumbnail> = {
  // Codex 制作の正式画像（2026-11-06。単色の連続線画 #315E68・透明背景・800×1000）
  "医療費シミュレーター": { file: "theme_cost_simulator.webp", alt: "電卓と書類の線画" },
};

export function themeImageFor(key: string): { src: string; alt: string } | null {
  const c = THEME_IMAGES[key] ?? SET_COVERS[key];
  return c ? { src: `/covers/${c.file}`, alt: c.alt } : null;
}
