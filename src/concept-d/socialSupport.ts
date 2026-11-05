/**
 * 「仕事とお金のこと」（社会制度の情報）。患者ホーム → テーマの画面 → 教材 4 件 → 医療費シミュレーター。
 * 教材は DB の公開教材を題名で束ねる（DB の学習領域は変えない）。教材 4 件は内容の確認後にシードへ登録する
 * （レビュー用の下書き: docs/design/social_support/materials_review_draft.md）。登録前はテーマの画面に「準備中」と出す。
 * 医療者の情報処方テンプレート名も同じ「仕事とお金のこと」（登録後）。処方の判定は教材の一致（learning.ts の setPrescribedAs）。
 */
export const MONEY_THEME = "仕事とお金のこと";
export const MONEY_TITLES = ["治療と仕事を両立するために", "傷病手当金を知る", "高額療養費制度を知る", "困ったときの相談先"] as const;
/** 医療費シミュレーターを開ける教材 */
export const SIMULATOR_MATERIAL = "高額療養費制度を知る";
export const SIMULATOR_NAME = "医療費シミュレーター";
