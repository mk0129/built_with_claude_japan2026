import "@/app/reset.css";

/**
 * ログイン画面（患者・医療者）の外枠。Figma Make Concept D にログイン画面のデザインがないため、
 * 認証機能を保つ目的で従来のログイン画面をそのまま使う（旧 UI の下部タブ・サイドバーは外した）。
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="reset-shell flex-1 flex flex-col w-full overflow-x-clip">
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto">
        <div className="rs-page flex-1 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
