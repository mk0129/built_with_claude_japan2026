import "@/app/reset-staff.css";
import { SideNav } from "./SideNav";
import { DeskBar } from "./DeskBar";

/** 医療者画面の骨格（Experience Reset 01 .desktop）: サイドバー＋上部バー＋コンテンツ。1024px 未満は横ナビ */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="reset-desk flex-1">
      <SideNav />
      <div className="rsd-app">
        <DeskBar />
        <div className="rsd-content max-w-6xl w-full mx-auto">{children}</div>
      </div>
    </div>
  );
}
