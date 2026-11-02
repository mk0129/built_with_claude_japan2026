"use client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

// LINE（generic OAuth）のクライアント側呼び出しは P1 で追加
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
