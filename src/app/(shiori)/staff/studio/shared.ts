import type { Principal } from "@/server/authz/principal";

export const staffPrincipal = (u: { id: string; name: string; email: string }): Principal => ({ userId: u.id, kind: "staff", name: u.name, email: u.email });

export const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  in_review: "承認待ち",
  approved: "承認済み",
  published: "公開中",
  superseded: "旧版",
  retired: "取り下げ",
  queued: "待機中",
  running: "作成中",
  succeeded: "完了",
  failed: "失敗",
};

export const JOB_MODE_LABEL: Record<string, string> = { outline: "構成案の提案", generate: "下書き作成（構成案から）", freeform: "下書き作成（テーマ指定）" };

/** 開発用の擬似生成（fake:）はモデル名を表示しない。実 API のときだけモデル名を出す */
export function modelLabel(generator: string, model: string): string | null {
  return generator === "claude" && !model.startsWith("fake:") ? model : null;
}

export function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
