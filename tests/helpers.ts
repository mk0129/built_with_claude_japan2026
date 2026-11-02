import { ensureMigrated, getDb } from "@/server/db/client";
import { seed } from "@/server/db/seed";
import { auth } from "@/server/auth/auth";

export type Seeded = Awaited<ReturnType<typeof seed>>;

export async function setupDb(): Promise<Seeded> {
  await ensureMigrated();
  return seed(getDb());
}

/** Better Auth で実際にサインインし、Cookie 付きの Headers を返す（HTTP 層のテスト用） */
export async function loginHeaders(email: string): Promise<Headers> {
  const res = await auth.api.signInEmail({
    body: { email, password: process.env.DEMO_PASSWORD! },
    asResponse: true,
  });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error(`login failed for ${email}: ${res.status}`);
  const cookie = setCookie
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
  return new Headers({ cookie });
}

export const PATIENT_A = "patient1@example.com";
export const PATIENT_B = "patient2@example.com";
export const DR_YAMADA = "dr.yamada@example.com"; // さくら総合病院
export const DR_KOBAYASHI = "dr.kobayashi@example.com"; // ひだまり医療センター
export const OP_EDITOR = "op.editor@example.com"; // 運営（clinician 役割なし）
