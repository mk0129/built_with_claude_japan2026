import { PatientDApp } from "@/concept-d/ConceptDApp";
import "./judge-patient.css";

export function JudgePatient() {
  const initial = Object.fromEntries(new URLSearchParams(window.location.search));
  return <PatientDApp initial={initial} userName="佐藤 花子" />;
}
