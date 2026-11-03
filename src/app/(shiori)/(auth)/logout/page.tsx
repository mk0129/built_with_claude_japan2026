"use client";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

/** ログアウト（正式 UI の Figma 版にはログアウトの操作がないため URL で用意する）。終了後は入口へ */
export default function LogoutPage() {
  useEffect(() => {
    authClient
      .signOut()
      .catch(() => {})
      .finally(() => window.location.replace("/"));
  }, []);
  return <p className="text-ink-soft">ログアウトしています…</p>;
}
