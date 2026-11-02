import { PatientTabs } from "@/components/PatientTabs";

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="patient-shell flex-1 flex flex-col w-full overflow-x-clip">
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto">
      <div className="patient-content flex-1 px-4 pt-5">{children}</div>
      <PatientTabs />
      </div>
    </div>
  );
}
