import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { AppError } from "@/server/authz/errors";

/** Route Handler 共通ラッパー。AppError → JSON、それ以外は 500（詳細は出さない） */
export function route<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AppError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
      }
      console.error("[route] unhandled", e);
      return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown = {};
  try {
    const text = await req.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError(400, "INVALID_JSON");
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new AppError(400, "VALIDATION_ERROR", z.prettifyError(r.error));
  return r.data;
}

export const ok = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
