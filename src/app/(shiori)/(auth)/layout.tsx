import "@/app/reset.css";

/** ログアウト（/logout）の外枠。入口・ログイン画面は (concept-d) グループへ移した（Concept D の配色・書体） */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="reset-shell flex-1 flex flex-col w-full overflow-x-clip">
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto">
        <div className="rs-page flex-1 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
