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

export const JOB_MODE_LABEL: Record<string, string> = { outline: "構成案（B）", generate: "教材生成（B）", freeform: "自由入力で生成（C）" };

export function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
