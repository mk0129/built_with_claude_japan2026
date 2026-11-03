"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/reset/Icons";

/** 下部ナビ（Experience Reset 01 の tab-link）。学習・クイズ中は非表示（主要ボタンと重ならないように） */
const TABS = [
  { href: "/home", label: "ホーム", icon: "home" as const },
  { href: "/library", label: "まなぶ", icon: "book" as const },
  { href: "/scores", label: "きろく", icon: "checkcircle" as const },
  { href: "/share", label: "共有", icon: "person" as const },
];
const HIDDEN_PREFIXES = ["/login", "/learn/", "/quiz/"];

export function PatientTabs() {
  const path = usePathname();
  if (HIDDEN_PREFIXES.some((p) => path.startsWith(p))) return null;
  return (
    <nav aria-label="メインメニュー" data-patient-tabs className="rs-tabs">
      <ul>
        {TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined} className="rs-tab">
                <Icon name={t.icon} />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
