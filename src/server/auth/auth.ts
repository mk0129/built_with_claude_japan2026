import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";

/**
 * 本番デプロイ判定。`next build` は NODE_ENV=production になるため、
 * デプロイ先の環境変数（Vercel の VERCEL_ENV、または APP_ENV）で判定する。
 */
const isProductionDeploy = process.env.VERCEL_ENV === "production" || process.env.APP_ENV === "production";
const demoAuthEnabled = process.env.DEMO_AUTH === "true" && !isProductionDeploy;

if (process.env.DEMO_AUTH === "true" && isProductionDeploy) {
  // 本番でデモ認証が有効なら起動を拒否する（設計 §3.1）
  throw new Error("DEMO_AUTH must not be enabled in production");
}

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {};

const lineConfig =
  process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET
    ? [
        {
          providerId: "line",
          name: "LINE",
          clientId: process.env.LINE_CHANNEL_ID,
          clientSecret: process.env.LINE_CHANNEL_SECRET,
          discoveryUrl: "https://access.line.me/.well-known/openid-configuration",
          scopes: ["openid", "profile", "email"],
          pkce: true,
        },
      ]
    : [];

export const auth = betterAuth({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "shiori",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  user: {
    additionalFields: {
      // patient | staff。サインアップ経路で決め、クライアントからは変更不可
      kind: { type: "string", required: false, defaultValue: "patient", input: false },
    },
  },
  // デモ専用のパスワードログイン。本番では無効
  emailAndPassword: { enabled: demoAuthEnabled, disableSignUp: process.env.SEED_MODE !== "1" },
  socialProviders: google,
  account: {
    // メール一致による自動統合はしない（AUTH-01）。連携はログイン中の明示操作のみ
    accountLinking: { enabled: true, trustedProviders: [] },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        // P1 で Resend に接続。未設定の間はサーバーログのみ（機微情報なし）
        if (!process.env.RESEND_API_KEY) {
          console.info(`[email-otp] to=${email} type=${type} otp=${otp}`);
          return;
        }
        const { sendOtpMail } = await import("@/server/services/mail");
        await sendOtpMail(email, otp);
      },
    }),
    genericOAuth({ config: lineConfig }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
export const isDemoAuthEnabled = demoAuthEnabled;
