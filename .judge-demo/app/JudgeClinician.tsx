import { useEffect, useState, useSyncExternalStore } from "react";
import ClinicianD from "@/concept-d/ClinicianD";
import { useClinicianLive, type ClinicianOrg } from "@/concept-d/live";
import { useClinicianRecord } from "@/concept-d/record";
import { useJudgeStudio } from "./judge-studio";
import fixture from "./fixtures/consultation.json";
import { getJudgeSession, isJudgeActive, subscribeJudgeSession } from "./judge-store";
import { getNativePatientGrant } from "./judge-patient-share";

const orgs: ClinicianOrg[] = [fixture.org];
function onWidthChange(listener:()=>void) {
  const mq=window.matchMedia("(min-width: 1180px)");
  mq.addEventListener("change",listener);
  return ()=>mq.removeEventListener("change",listener);
}
export function JudgeClinician({onEnd}: {onEnd:()=>void}) {
  const session=useSyncExternalStore(subscribeJudgeSession,getJudgeSession);
  const wide=useSyncExternalStore(onWidthChange,()=>window.matchMedia("(min-width: 1180px)").matches);
  const [notice, setNotice]=useState<{text:string,tone:"info"|"error"}|null>(null);
  const notify=(text:string,tone:"info"|"error"="info")=>setNotice({text,tone});
  const live=useClinicianLive(isJudgeActive(session)?session!.id:null,orgs,notify);
  useEffect(()=>{
    const address=new URL(window.location.href);
    const claim=address.searchParams.get("claim");
    if(!claim)return;
    address.searchParams.delete("claim");
    window.history.replaceState(window.history.state,"",address);
    const grant=getNativePatientGrant();
    if(grant?.grantId===claim && !grant.claimed){
      void live.claimCode(grant.code);
    }else if(!grant || grant.grantId!==claim){
      setNotice({text:"コードを発行したデモのタブで「医師側」に切り替え、6桁コードを入力してください。",tone:"error"});
    }
  },[live.claimCode]);
  const active=isJudgeActive(session) && live.state==="active" && !live.ending;
  const record=useClinicianRecord(live.sessionId,active,text=>notify(text,"error"));
  const studio=useJudgeStudio(live.org?.orgId??null,active,text=>notify(text,"error"));
  useEffect(()=>{
    if (!notice) return;
    const t=window.setTimeout(()=>setNotice(null),notice.tone==="error"?5800:3000);
    return ()=>window.clearTimeout(t);
  },[notice]);
  useEffect(()=>{ if (live.state==="expired" || live.state==="ended" || (live.state==="active" && !isJudgeActive(session))) onEnd(); },[session,live.state,onEnd]);
  return <div className="cd-app-stage">
    <ClinicianD variant="app" live={live} record={record} studio={studio} viewport={wide?"1180":"820"}
      healthRecords={[]} activeSymptomIds={[]} customSymptomNames={{}} />
    {notice && <div className={`cd-toast${notice.tone==="error"?" cd-toast-error":""}`} role={notice.tone==="error"?"alert":"status"}>{notice.text}</div>}
  </div>;
}
