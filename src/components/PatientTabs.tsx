"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/home", label: "ホーム", icon: "⌂" },
  { href: "/scores", label: "きろく", icon: "✎" },
  { href: "/share", label: "共有", icon: "⇄" },
];

export function PatientTabs() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <nav aria-label="メインメニュー" className="fixed bottom-0 inset-x-0 bg-surface border-t border-line">
      <ul className="max-w-md mx-auto grid grid-cols-3">
        {TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center min-h-[64px] text-sm ${active ? "text-accent font-bold" : "text-ink-soft"}`}
              >
                <span aria-hidden className="text-xl leading-none">
                  {t.icon}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
