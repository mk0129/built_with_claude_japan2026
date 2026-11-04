/**
 * 撮影用デモ環境の設定（開発・デモ専用。本番では無効）。
 * - DEMO_ANCHOR: 架空の初期データを作る基準日時（ISO）。撮影日が変わっても同じ日付の記録になる。未設定なら現在時刻。
 * - INTERVISIT_REPLAY_FILE / STUDIO_REPLAY_FILE: 記録済みの Claude 出力の再生（scripts/build-*-replay.ts で作成）。
 */
export const isProductionEnv = () => process.env.NODE_ENV === "production" || process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production";

export function demoNow(): Date {
  const a = process.env.DEMO_ANCHOR;
  if (!a || isProductionEnv()) return new Date();
  const d = new Date(a);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export const replayFile = (name: "INTERVISIT_REPLAY_FILE" | "STUDIO_REPLAY_FILE") => (isProductionEnv() ? null : process.env[name] || null);
