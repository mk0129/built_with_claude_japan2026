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
  // 例: "化学療法中の副作用とセルフケア": { file: "thumb_selfcare.webp", alt: "自宅で体調を記録しながら休む人の水彩イラスト" },
};

export function thumbnailFor(title: string): { src: string; alt: string } | null {
  const t = THUMBNAILS[title];
  return t ? { src: `/thumbnails/${t.file}`, alt: t.alt } : null;
}
