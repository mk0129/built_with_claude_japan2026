import { IconHome, IconRecord, IconShare } from "./Icons";

/** 患者画面の外枠（max-w-md・下部タブ）。本番 PatientTabs と同じ構成でアイコンを線画に */
export function PatientFrame({ children, tab, tabs = true }: { children: React.ReactNode; tab?: "home" | "scores" | "share"; tabs?: boolean }) {
  return (
    <div className="flex-1 flex flex-col max-w-md w-full mx-auto">
      <div className={`flex-1 px-4 pt-5 ${tabs ? "pb-28" : "pb-8"}`}>{children}</div>
      {tabs && (
        <nav aria-label="メインメニュー" className="fixed bottom-0 inset-x-0 bg-surface border-t border-line z-10" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <ul className="max-w-md mx-auto grid grid-cols-3">
            {(
              [
                ["home", "ホーム", <IconHome key="h" />],
                ["scores", "きろく", <IconRecord key="r" />],
                ["share", "共有", <IconShare key="s" />],
              ] as const
            ).map(([k, label, icon]) => (
              <li key={k}>
                <a href="#" className="pb-tab" aria-current={tab === k ? "page" : undefined}>
                  {icon}
                  <span>{label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
