import { PatientTabs } from "@/components/PatientTabs";
import "@/app/reset.css";

/** 患者画面の外枠（Experience Reset 01）。ヘッダーは画面ごと、下部タブは共通 */
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="reset-shell flex-1 flex flex-col w-full overflow-x-clip">
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto">
        <div className="rs-page flex-1 flex flex-col">{children}</div>
        <PatientTabs />
      </div>
    </div>
  );
}
