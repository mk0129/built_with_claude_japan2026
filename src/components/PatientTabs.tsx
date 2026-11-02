"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/home", label: "ホーム", icon: "⌂" },
  { href: "/scores", label: "きろく", icon: "✎" },
  { href: "/share", label: "共有", icon: "⇄" },
];

/** 学習・クイズ中は非表示（主要ボタンと重ならないように）。上部の「← ホームへ」で戻る */
const HIDDEN_PREFIXES = ["/login", "/learn/", "/quiz/"];

export function PatientTabs() {
  const path = usePathname();
  if (HIDDEN_PREFIXES.some((p) => path.startsWith(p))) return null;
  return (
    <nav aria-label="メインメニュー" data-patient-tabs className="patient-tabs fixed bottom-0 inset-x-0 bg-surface border-t border-line z-10">
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
