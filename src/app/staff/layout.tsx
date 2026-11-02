import Link from "next/link";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-line bg-surface">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/staff" className="font-bold inline-flex items-center min-h-11">
            {process.env.NEXT_PUBLIC_APP_NAME ?? "しおり（仮）"} <span className="text-sm font-normal text-ink-soft">医療者用</span>
          </Link>
          <span className="pill">架空データ・デモ</span>
        </div>
      </header>
      <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</div>
    </div>
  );
}
