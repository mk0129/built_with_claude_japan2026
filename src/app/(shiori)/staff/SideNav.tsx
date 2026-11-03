"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/reset/Icons";
import { SignOutButton } from "@/components/SignOutButton";

/** 左のサイドバー（参照の .sidebar）。実在する画面だけを置く（永続的な患者一覧やレポートは作らない） */
export function SideNav() {
  const path = usePathname();
  const items = [
    { href: "/staff", label: "診察", icon: "person" as const, active: path === "/staff" || path.startsWith("/staff/scan") || path.startsWith("/staff/consult") },
    { href: "/staff/studio", label: "教材スタジオ", icon: "sparkle" as const, active: path.startsWith("/staff/studio") || path.startsWith("/staff/materials") },
  ];
  return (
    <aside className="rsd-sidebar">
      <div className="rsd-brand">
        <i className="rsd-brandmark" aria-hidden />
        shiori
      </div>
      <div className="rsd-sidesection">WORKSPACE</div>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="rsd-sidenav" aria-current={i.active ? "page" : undefined}>
          <Icon name={i.icon} size="sm" />
          {i.label}
        </Link>
      ))}
      <div className="rsd-sidesection" style={{ marginTop: 45 }}>
        ACCOUNT
      </div>
      <SignOutButton to="/staff/login" variant="sidenav" />
    </aside>
  );
}
