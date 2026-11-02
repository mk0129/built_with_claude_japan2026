import { PatientTabs } from "@/components/PatientTabs";

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col max-w-md w-full mx-auto overflow-x-clip">
      <div className="patient-content flex-1 px-4 pt-5">{children}</div>
      <PatientTabs />
    </div>
  );
}
