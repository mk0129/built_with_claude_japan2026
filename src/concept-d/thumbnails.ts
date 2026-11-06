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
  // 社会制度の 4 教材の画像は受け取り済み（docs/design/final_assets/pending_social/）。教材の承認・登録と同時にここへ追加する
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
