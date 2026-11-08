import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/server/auth/auth";
import { GET as libraryRoute } from "@/app/api/v1/library/route";
import { GET as staffLive } from "@/app/api/v1/staff/live/route";
import { setupDb } from "../helpers";

/**
 * 患者の新規登録: メールの確認コード（email OTP）の確認が通るとアカウントができる。
 * 自己登録でできるのは患者（kind=patient）だけで、クライアントから kind は変えられない。表示名はあとから設定できる。
 * 確認コードは、メール送信の設定がないときサーバーログに出るので、それを拾って使う（本文は見ない）。
 */
const cookieOf = (res: Response) => {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error(`no cookie: ${res.status}`);
  return new Headers({ cookie: setCookie.split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim()).join("; ") });
};
const req = (headers: Headers) => new Request("http://localhost:3000/x", { headers });

beforeAll(async () => {
  await setupDb();
});
afterEach(() => vi.restoreAllMocks());

describe("患者の新規登録（メール確認コード）", () => {
  it("コードを送る → 確認で患者アカウントができる → 表示名を設定 → 患者の API は使え、医療者の API は拒否。kind は変えられない", async () => {
    delete process.env.RESEND_API_KEY;
    const email = `new.patient.${Date.now()}@example.com`;
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const otp = logs.map((l) => /\[email-otp\] .*otp=(\d{6})/.exec(l)?.[1]).find(Boolean);
    expect(otp, "確認コードがログに出る").toBeTruthy();

    // 間違ったコードでは入れない
    const bad = await auth.api.signInEmailOTP({ body: { email, otp: otp === "000000" ? "111111" : "000000" }, asResponse: true });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const ok = await auth.api.signInEmailOTP({ body: { email, otp: otp! }, asResponse: true });
    expect(ok.status).toBe(200);
    const h = cookieOf(ok);
    const session = await auth.api.getSession({ headers: h });
    expect(session?.user.email).toBe(email);
    expect((session?.user as { kind?: string }).kind ?? "patient").toBe("patient");

    // kind はクライアントから設定できない（拒否される）。表示名は設定できる
    await expect(auth.api.updateUser({ body: { kind: "staff" } as unknown as { name: string }, headers: h })).rejects.toThrow(/kind/);
    await auth.api.updateUser({ body: { name: "はなこ" }, headers: h });
    const after = await auth.api.getSession({ headers: h });
    expect(after?.user.name).toBe("はなこ");
    expect((after?.user as { kind?: string }).kind ?? "patient").toBe("patient");

    // 患者の API は使える（処方はまだないので一覧は返るが空でもよい）。医療者の API は拒否
    expect((await libraryRoute(req(h))).status).toBe(200);
    expect((await staffLive(req(h))).status).toBeGreaterThanOrEqual(401);
  });
});
