"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!res.ok) throw new ApiError(res.status, data.error ?? "ERROR", data.message);
  return data;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      UNAUTHENTICATED: "ログインが必要です",
      GRANT_INVALID_OR_USED: "コードが無効か、期限切れ・使用済みです",
      GRANT_EXPIRED: "QRコードの有効期限が切れました。もう一度表示してください",
      GRANT_ALREADY_DECIDED: "この要求はすでに処理済みです",
      NO_ACTIVE_CONSULTATION: "有効な診察セッションがありません",
      NOT_ORG_MEMBER: "この医療機関に所属していません",
      ROLE_REQUIRED: "この操作の権限がありません",
      SESSION_NOT_ACTIVE: "セッションはすでに終了しています",
      SAFETY_UNCONFIRMED: "安全上の重要事項が未確認です。必須事項を確認するか、理由を記録したうえで承認してください",
      NOT_EDITABLE: "この状態では変更できません",
      TOO_MANY_ATTEMPTS: "コードの入力に続けて失敗しました。10分ほど待ってから再度お試しください",
      ORG_REQUIRED: "申請を出す医療機関を選んでください",
      REQUEST_EXPIRED: "QRコードの有効期限が切れています。医療者に新しいQRを表示してもらってください",
      REQUEST_ALREADY_DECIDED: "この申請はすでに処理済みです",
      NO_PENDING_EXTENSION: "延長の申請はすでに処理されています",
      NOT_AVAILABLE: "この教材は現在ご覧いただけません",
      ANSWER_ALREADY_SUBMITTED: "この設問には回答済みです",
    };
    return map[e.code] ?? `${e.code}${e.message && e.message !== e.code ? `: ${e.message}` : ""}`;
  }
  return e instanceof Error ? e.message : "エラーが発生しました";
}
