import "./pb.css";

/** Porcelain Blue 比較用（/pb/*）。各ページで requirePageUser("staff") を行う。本番 UI は未変更 */
export default function PbLayout({ children }: { children: React.ReactNode }) {
  return <div className="pb-shell flex-1 flex flex-col w-full overflow-x-clip">{children}</div>;
}
