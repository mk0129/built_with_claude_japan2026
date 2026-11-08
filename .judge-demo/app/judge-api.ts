import fixture from "./fixtures/consultation.json";
import { ApiError } from "./judge-errors";
import { addDeliveries, endJudgeSession, getJudgeSession, isJudgeActive, requestJudgeExtension, setFeedbackStatus } from "./judge-store";
import { patientApi, patientLearningChanges, rememberNativeDeliveries } from "./judge-patient-api";
import { nativeRecordApi, nativeClinicianHealth, nativeClinicianNotes, nativeResolveNote, nativeTemplates, nativeCreateTemplate, nativeTreatment, hasNativeRecordChanges } from "./judge-native-records";
import { nativePeriodPayload } from "./judge-native-period";
import { studioApi, studioPublishedForVisit } from "./judge-studio";
import { recommendMaterials } from "@/lib/recommend";
export { ApiError, errorText } from "./judge-errors";

type Options = RequestInit & { json?: any };
const copy = <T,>(value:T):T => structuredClone(value);
const forbidden=()=>new ApiError(403,"NO_ACTIVE_CONSULTATION","この診察の共有は終了しています");
const reject=(message:string)=>new ApiError(400,"BAD_REQUEST",message);

/** These are Japanese case records. The product's client renders wall-clock time
 * with the device time zone, so project the fixed case's dates onto that clock.
 * Actual session expiry and delivery timestamps stay real instants.
 */
function caseDates<T>(value:T):T {
  return JSON.parse(JSON.stringify(value),(_,v)=>
    typeof v==="string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v)
    ? new Date(Date.parse(v)+9*3600000).toISOString().slice(0,-1) : v);
}

export async function api<T = unknown>(path: string, init:Options = {}):Promise<T> {
  const url=new URL(path,window.location.origin);
  const method=(init.method || (init.json===undefined ? "GET" : "POST")).toUpperCase();
  const patient=await patientApi(url,method,init.json);
  if(patient.handled) return patient.data as T;
  const record=nativeRecordApi(url,method,init.json);
  if(record.handled) return record.data as T;
  const session=getJudgeSession();
  const active=isJudgeActive(session);
  if (!session) throw forbidden();
  if (url.pathname.startsWith("/api/v1/studio/")) {
    if (!active) throw forbidden();
    const result=await studioApi(path,init,session.id);
    if (result.handled) return result.data as T;
    throw new ApiError(404,"NOT_AVAILABLE","審査体験ではこの教材操作を利用できません");
  }

  const m=url.pathname.match(/^\/api\/v1\/consultations\/([^/]+)(?:\/(.*))?$/);
  if (!m || m[1]!==session.id) throw forbidden();
  const endpoint=m[2] ?? "";
  if (endpoint==="end" && method==="POST") {
    const alreadyEnded=!active; endJudgeSession(); return {alreadyEnded} as T;
  }
  if (!endpoint && method==="GET") {
    return {...fixture.session,id:session.id,startedAt:session.startedAt,expiresAt:session.expiresAt,active,
      endedAt:session.endedAt,endedBy:active?null:(session.endedBy??"system"),
      pendingExtension:active && session.pendingExtension?{id:session.id+"-extension"}:null,
      patientName:active ? fixture.session.patientName : null} as T;
  }
  if (!active) throw forbidden();
  const materials=[...fixture.materials.items,...studioPublishedForVisit(session.id)];
  if (endpoint==="patient" && method==="GET") {
    const answers=[...patientLearningChanges(),...fixture.patient.answers]
      .sort((a,b)=>b.answeredAt.localeCompare(a.answeredAt));
    const data=caseDates({...fixture.patient,answers,visitNotes:nativeClinicianNotes()});
    return {...data, questions:data.questions.map(q=>({...q,status:session.feedbackStatus[q.feedbackId]??q.status})),
      currentSet:session.prescriptions.length ? {setId:session.id,createdAt:session.prescriptions[0].prescribedAt,items:copy(session.prescriptions)} : data.currentSet} as T;
  }
  if (endpoint==="materials" && method==="GET") return {items:copy(materials)} as T;
  if (endpoint==="recommendations" && method==="GET") {
    // 審査用デモ: ルールベースのリコメンドだけ（Claude は呼ばない）
    const answers=[...patientLearningChanges(),...fixture.patient.answers];
    const nowIds=new Set(session.prescriptions.map(p=>p.materialId));
    const before=new Set(fixture.patient.learning.filter(l=>l.prescribed).map(l=>l.materialId));
    const health=nativeClinicianHealth().records.filter(r=>Date.parse(r.measuredAt)>=Date.now()-120*864e5);
    const sym=new Map<string,{name:string;max:number}>();
    for(const r of health)for(const s of r.symptoms)sym.set(s.key,{name:s.name,max:Math.max(sym.get(s.key)?.max??0,s.severity)});
    const items=recommendMaterials({
      materials:materials.map(m=>({materialId:m.materialId,title:m.title,summary:m.summary,primaryDomain:m.primaryDomain,prescribedNow:nowIds.has(m.materialId),prescribedBefore:before.has(m.materialId)})),
      questions:[...nativeClinicianNotes().filter(n=>!n.resolvedAt).map(n=>({id:"vn:"+n.id,body:n.body,materialId:n.materialId})),...fixture.patient.questions.filter(q=>q.freeText).map(q=>({id:q.feedbackId,body:q.freeText as string,materialId:q.materialId}))],
      misses:answers.filter(a=>!a.isCorrect).map(a=>({materialId:a.materialId,materialTitle:a.materialTitle,stem:a.stem,isUnknown:a.isUnknown})),
      symptoms:[...sym.entries()].map(([key,v])=>({key,...v})),
      unlearned:fixture.patient.learning.filter(l=>l.prescribed&&l.phase!=="completed").map(l=>({materialId:l.materialId,title:l.title,phase:l.phase})),
    },3);
    return {generator:"rule",model:null,items,note:items.length?null:"質問・症状・理解確認のつまずき・未学習の教材がないため、候補はありません。"} as T;
  }
  if (endpoint==="templates" && method==="GET") return {templates:[...copy(fixture.templates).templates,...nativeTemplates()]} as T;
  if (endpoint==="templates" && method==="POST") {
    const t=nativeCreateTemplate(init.json as {name?:unknown;materialIds?:unknown}|undefined,(id)=>{const m=materials.find(x=>x.materialId===id);return m?{id:m.materialId,title:m.title,primaryDomain:m.primaryDomain}:null;});
    return {id:t.id,templates:[...copy(fixture.templates).templates,...nativeTemplates()]} as T;
  }
  if (endpoint==="health" && method==="GET") return caseDates(nativeClinicianHealth()) as T;
  if (endpoint==="treatment" && method==="GET") return nativeTreatment() as T;
  if (endpoint==="intervisit" && method==="GET") {
    const data=await nativePeriodPayload(url.searchParams.get("from"),url.searchParams.get("to"));
    if (!isJudgeActive(getJudgeSession()) || getJudgeSession()?.id!==session.id) throw forbidden();
    return caseDates(data) as T;
  }
  if (endpoint==="intervisit/summary" && method==="POST") {
    const from=init.json?.from as string | undefined,to=init.json?.to as string | undefined;
    const data=await nativePeriodPayload(from,to);
    if (!isJudgeActive(getJudgeSession()) || getJudgeSession()?.id!==session.id) throw forbidden();
    if (!hasNativeRecordChanges() && ((!from && !to) || (from===fixture.intervisit.intervisit.period.from && to===fixture.intervisit.intervisit.period.to)))
      return caseDates({...fixture.aiSummary,period:data.intervisit.period}) as T;
    return caseDates({status:"fallback",generator:"rule",model:null,items:data.ruleSummary,rejected:[],sources:data.sources,
      dataHash:"judge:"+data.intervisit.period.from+"/"+data.intervisit.period.to,
      generatedAt:fixture.aiSummary.generatedAt,cached:false,
      fallbackReason:"現在の記録に対応するClaudeの再生データがないため、記録から整理したサマリーを表示しています。"
    }) as T;
  }
  if (endpoint==="prescriptions" && method==="POST") {
    const ids=init.json?.materialIds;
    if (!Array.isArray(ids) || !ids.length || ids.length>materials.length) throw reject("処方する教材を選んでください");
    const items=[...new Set(ids)].map(id=>{
      const material=materials.find(x=>x.materialId===id);
      if (!material) throw reject("表示中の教材から選んでください");
      return {materialId:material.materialId,title:material.title};
    });
    if (init.json?.note!=null && (typeof init.json.note!=="string" || init.json.note.length>1500)) throw reject("メッセージを短くしてください");
    const added=addDeliveries(items,init.json?.note?.trim()??"");
    rememberNativeDeliveries();
    return {count:added.length,materialIds:added.map(x=>x.materialId)} as T;
  }
  if (endpoint.startsWith("notes/") && method==="POST") {
    const id=endpoint.split("/")[1];
    if (typeof init.json?.resolved!=="boolean" || !nativeResolveNote(id,init.json.resolved)) throw reject("対象の質問を確認してください");
    return {ok:true} as T;
  }
  if (endpoint.startsWith("questions/") && method==="POST") {
    const id=endpoint.split("/")[1],status=init.json?.status;
    if (!(status==="reviewed" || status==="resolved") || !fixture.patient.questions.some(q=>q.feedbackId===id)) throw reject("対象の質問を確認してください");
    setFeedbackStatus(id,status);return {ok:true} as T;
  }
  if (endpoint==="extend" && method==="POST") {requestJudgeExtension();return {requested:true} as T;}
  throw new ApiError(404,"NOT_AVAILABLE","審査体験ではこの操作を利用できません");
}
