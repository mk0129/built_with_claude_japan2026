import type { IntervisitEvent } from "@/server/services/intervisit";
import { fmtDate, localDay } from "@/server/services/intervisit-format";
import { ApiError } from "./judge-errors";
import { periodPayload } from "./judge-period";
import { ruleSummary, sourceIndex } from "./judge-period-rules";
import { hasNativeRecordChanges, nativeCaseDay, nativeClinicianHealth, nativeClinicianNotes } from "./judge-native-records";
import { nativeHealthSummary } from "./judge-native-period-health";
import { patientLearningChanges } from "./judge-patient-api";

const DAY=864e5;
const asDate=(day:string)=>new Date(day+"T00:00:00+09:00");
function validDay(day:string) {
  const t=asDate(day);
  return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(t.getTime())&&localDay(t)===day;
}
export async function nativePeriodPayload(from?:string|null,to?:string|null) {
  if(!hasNativeRecordChanges()) return periodPayload(from,to);
  const today=nativeCaseDay(), end=to||today;
  if(!validDay(end)) throw new ApiError(400,"INVALID_PERIOD","終了日を確認してください");
  const start=from||localDay(new Date(asDate(end).getTime()-13*DAY));
  const days=(asDate(end).getTime()-asDate(start).getTime())/DAY+1;
  if(!validDay(start)||days<1||days>92||end>today) throw new ApiError(400,"INVALID_PERIOD","開始日・終了日を確認してください（92日以内）");
  // Keep the captured learning and prescription timeline. Replace only mutable
  // observations and visit notes, then rebuild the genuine source index and rules.
  const captured=await periodPayload();
  const iv=structuredClone(captured.intervisit);
  const inRange=(iso:string)=>{const d=localDay(new Date(iso));return d>=start&&d<=end;};
  iv.period={from:start,to:end,days,isDefault:!from&&!to,label:!from&&!to?"直近14日間":"指定期間"};
  iv.fmt={from:fmtDate(asDate(start)),to:fmtDate(asDate(end))};
  const health=nativeHealthSummary(nativeClinicianHealth().records,iv.period);
  iv.vitals=health.vitals;
  iv.symptoms=health.symptoms;
  const notes=nativeClinicianNotes().filter(n=>inRange(n.createdAt)||inRange(n.updatedAt)).map(n=>({
    sourceId:"vn:"+n.id,kind:"診察ノート" as const,body:n.body,input:"free_text" as const,selection:null,
    createdAt:n.createdAt,updatedAt:n.updatedAt,materialTitle:n.materialTitle
  }));
  iv.questions=[...iv.questions.filter(q=>q.kind!=="診察ノート"&&inRange(q.createdAt)),...notes].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const noteEvents:IntervisitEvent[]=notes.map(n=>({id:n.sourceId,kind:"note",at:n.createdAt,day:localDay(new Date(n.createdAt)),label:`質問（診察ノート）：「${n.body}」`,ref:{table:"visit_notes",id:n.sourceId.slice(3)},data:{body:n.body,materialTitle:n.materialTitle,updatedAt:n.updatedAt}}));
  iv.events=[...iv.events.filter(e=>e.kind!=="note"&&e.kind!=="symptom"&&e.kind!=="vital"&&inRange(e.at)),...health.events,...noteEvents];
  iv.learning=iv.learning.map(l=>({...l,answersInPeriod:l.answersInPeriod.filter(a=>inRange(a.at))}));
  const answers=patientLearningChanges().sort((a,b)=>a.answeredAt.localeCompare(b.answeredAt));
  for(const a of answers) {
    const result=a.isUnknown?"わからない":a.isCorrect?"正答":"誤答";
    let item=iv.learning.find(l=>l.versionId===a.versionId);
    if(!item){
      item={materialId:a.materialId,versionId:a.versionId,title:a.materialTitle,versionNo:1,prescribedAt:null,
        prescriptionSourceId:null,startedAt:null,completedAt:null,status:"学習途中",answersInPeriod:[]};
      iv.learning.push(item);
    }
    if(inRange(a.answeredAt)){
      const sourceId="qa:"+a.answerId;
      item.answersInPeriod.push({sourceId,result,stem:a.stem,at:a.answeredAt});
      iv.events.push({id:sourceId,kind:"answer",at:a.answeredAt,day:localDay(new Date(a.answeredAt)),
        label:`理解確認（${result}）：「${a.stem}」`,ref:{table:"quiz_answers",id:a.answerId},
        data:{result,stem:a.stem,selected:a.selectedText,correct:a.correctText,materialId:a.materialId,title:a.materialTitle,versionNo:item.versionNo,questionId:a.questionId}});
    }
    if(a.attemptCompleted){
      item.status="完了";item.completedAt=a.answeredAt;
    } else if(!item.completedAt) item.status="学習途中";
  }
  iv.events.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  return {intervisit:iv,ruleSummary:ruleSummary(iv),sources:Object.fromEntries(sourceIndex(iv))};
}
