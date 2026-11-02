"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ to = "/" }: { to?: string }) {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost text-sm"
      onClick={async () => {
        await authClient.signOut();
        router.push(to);
        router.refresh();
      }}
    >
      ログアウト
    </button>
  );
}
