/** 認可・検証エラー。Route Handler で HTTP ステータスに変換する */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export const unauthorized = (code = "UNAUTHENTICATED") => new AppError(401, code);
export const forbidden = (code = "FORBIDDEN", message?: string) => new AppError(403, code, message);
export const notFound = (code = "NOT_FOUND") => new AppError(404, code);
export const conflict = (code = "CONFLICT", message?: string) => new AppError(409, code, message);
export const badRequest = (code = "BAD_REQUEST", message?: string) => new AppError(400, code, message);
