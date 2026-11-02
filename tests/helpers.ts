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

import { approveGrant, claimGrant, createGrant } from "@/server/services/qr";

/** 患者が QR を出し、医療者が読み取り、患者が承認するまで */
export async function startSession(seeded: Seeded, patientEmail: string, staffEmail: string, orgSlug: string) {
  const g = await createGrant(seeded.users.get(patientEmail)!);
  await claimGrant({ token: g.token, staffUserId: seeded.users.get(staffEmail)!, orgId: seeded.orgs.get(orgSlug)! });
  const { consultationSessionId } = await approveGrant(g.grantId, seeded.users.get(patientEmail)!);
  return { grant: g, sessionId: consultationSessionId };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
