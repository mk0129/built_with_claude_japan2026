/**
 * 教材カードのサムネイル（Phase 2 Step 5）。完成画像を public/thumbnails/ に置き、ここに登録すると Figma のレイアウトのまま表示する。
 * 登録がない教材は Figma の「画像準備中」の枠を表示する。一覧・必要サイズ: docs/design/phase2/step5/thumbnails.md
 *
 * サムネイルは雰囲気を伝える一般的なイラスト（医学的な内容を含めない）。体の仕組み・手技などの医学的な解説図は
 * 別の仕組み（figure_assets・図解の監修）で扱い、医療者の内容確認（承認）後にだけ学習画面に表示する。
 * 教材 ID はデータベースごとに異なるため、シードの教材名をキーにする。
 */
export type Thumbnail = { file: string; alt: string };

export const THUMBNAILS: Record<string, Thumbnail> = {
  // 教材 v1.1（編集草稿・医学的監修前。題名は DB の教材名と完全一致）。線画 #315E68・1600×1200・透過 WebP
  "乳がんの治療は、どう組み合わせて決める？": { file: "thumb_treatment_choices.webp", alt: "医療者と患者が相談する線画" },
  "手術後の病理検査では、何がわかる？": { file: "thumb_pathology.webp", alt: "病理結果について説明を受ける線画" },
  "抗がん剤治療で気をつけたい体調の変化": { file: "thumb_symptom_check.webp", alt: "自宅で体調を記録する線画" },
  "子どもに乳がんをどう伝える？": { file: "thumb_family_talk.webp", alt: "家族と向き合って会話する線画" },
  // 既存のシード教材: 題材が一致するものだけ（化学療法中の体調の変化と自宅での記録）
  "化学療法中の副作用とセルフケア": { file: "thumb_symptom_check.webp", alt: "自宅で体調を記録する線画" },
};

export function thumbnailFor(title: string): { src: string; alt: string } | null {
  const t = THUMBNAILS[title];
  return t ? { src: `/thumbnails/${t.file}`, alt: t.alt } : null;
}
