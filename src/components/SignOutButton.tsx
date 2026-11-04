"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Icon } from "@/components/reset/Icons";

export function SignOutButton({ to = "/", variant = "default" }: { to?: string; variant?: "default" | "sidenav" | "auth" }) {
  const router = useRouter();
  const signOut = async () => {
    await authClient.signOut();
    router.push(to);
    router.refresh();
  };
  if (variant === "sidenav")
    return (
      <button className="rsd-sidenav" onClick={signOut}>
        <Icon name="logout" size="sm" />
        ログアウト
      </button>
    );
  if (variant === "auth")
    return (
      <button className="au-text-button" onClick={signOut}>
        ログアウト
      </button>
    );
  return (
    <button className="btn btn-ghost text-sm" onClick={signOut}>
      ログアウト
    </button>
  );
}
