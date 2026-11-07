import { symptomLibrary } from "@/concept-d/healthData";
import type { ApiRecord, HealthInput } from "@/concept-d/health";
import { localDay } from "@/server/services/intervisit-format";
import fixture from "./fixtures/consultation.json";
import { ApiError } from "./judge-errors";
import { nativePatientMaterial, patientAnsweredQuestion, patientLearningChanges } from "./judge-patient-api";

type Note = { id: string; body: string; source: "free" | "quiz"; materialId: string | null; materialTitle: string | null; primaryDomain: string | null; createdAt: string; updatedAt: string };
type Settings = { active: string[]; hidden: string[]; customNames: Record<string,string> };
type Records = { records: ApiRecord[]; notes: Note[]; settings: Settings; visit: {date:string; updatedAt:string}|null; changed: boolean };
const key = "shiori:judge:patient-records:v1";
const clone = <T,>(x:T):T => structuredClone(x);
const invalid = (code:string, message:string) => new ApiError(400,code,message);
const missing = (code:string) => new ApiError(404,code,"この記録が見つかりません");
let memory:Records|undefined;
function data():Records {
  if (memory) return memory;
  try { const raw=sessionStorage.getItem(key); if(raw) memory=JSON.parse(raw); } catch {}
  memory ??= {records:clone(fixture.health.records),notes:clone(fixture.patient.visitNotes) as Note[],settings:clone(fixture.health.symptoms),visit:null,changed:false};
  return memory;
}
function save(changed = true) {
  const state=data();
  if(changed) state.changed=true;
  try {sessionStorage.setItem(key,JSON.stringify(state));} catch {}
}
export function hasNativeRecordChanges() {return data().changed||patientLearningChanges().length>0;}
export function nativeClinicianHealth() {return {records:clone(data().records).sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt)||b.createdAt.localeCompare(a.createdAt)),symptoms:clone(data().settings)};}
export function nativeClinicianNotes() {return clone(data().notes).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
const fixedDay=fixture.intervisit.intervisit.period.to;
export function nativeCaseDay() {
  return [...data().records.map(r=>r.measuredAt),...data().notes.map(n=>n.updatedAt),...patientLearningChanges().map(a=>a.answeredAt)].reduce(
    (day:string,iso:string)=>{const d=localDay(new Date(iso));return d>day?d:day;},fixedDay);
}
// The fixture and clinician timeline use Tokyo calendar days. Treat the time
// shown/entered on this visitor's device as the fictional case's wall time.
const wall=(v:string)=>new Date(Date.parse(v)+9*3600000).toISOString().slice(0,-1);
const deviceToCase=(d:Date)=>new Date(d.getTime()-d.getTimezoneOffset()*60000-9*3600000).toISOString();
const now=()=>deviceToCase(new Date());
function patientRecord(r:ApiRecord) {return {...r,measuredAt:wall(r.measuredAt),createdAt:wall(r.createdAt),updatedAt:wall(r.updatedAt)};}
function patientNote(n:Note) {return {...n,createdAt:wall(n.createdAt),updatedAt:wall(n.updatedAt)};}
const limits={temperature:[30,45],systolic:[50,260],diastolic:[30,160],pulse:[20,250],spo2:[50,100]} as const;
const isKnown=(key:string)=>symptomLibrary.some(s=>s.id===key);
const isCustom=(key:string)=>/^custom-[a-z0-9-]{4,60}$/i.test(key);
function cleanVitals(input:HealthInput["vitals"]):ApiRecord["vitals"] {
  const values={} as ApiRecord["vitals"];
  for(const k of Object.keys(limits) as (keyof typeof limits)[]) {
    const value=input?.[k]??null;
    if(value!==null && (!Number.isFinite(value)||value<limits[k][0]||value>limits[k][1]||(k!=="temperature"&&!Number.isInteger(value)))) throw invalid("INVALID_VITAL","測定値の範囲を確認してください");
    values[k]=value;
  }
  return values;
}
function prepareRecord(input:HealthInput,previous?:ApiRecord):ApiRecord {
  const measured=new Date(input?.measuredAt);
  if(!Number.isFinite(measured.getTime())||measured.getTime()>Date.now()+10*60000) throw invalid("INVALID_MEASURED_AT","測定日時を確認してください");
  const rows=input.symptoms??[];
  if(!Array.isArray(rows)||rows.length>60||new Set(rows.map(s=>s.key)).size!==rows.length) throw invalid("INVALID_SYMPTOM","入力した症状を確認してください");
  const symptoms=rows.map(s=>{
    const name=symptomLibrary.find(x=>x.id===s.key)?.name || (isCustom(s.key) && data().settings.customNames[s.key]);
    if(!name||!Number.isInteger(s.severity)||s.severity<0||s.severity>4) throw invalid("INVALID_SEVERITY","症状の程度は0〜4で記録します");
    if(s.count!=null&&(!Number.isInteger(s.count)||s.count<0||s.count>99)) throw invalid("INVALID_COUNT","回数を確認してください");
    if((s.location?.length??0)>100||(s.interference?.length??0)>200) throw invalid("INVALID_DETAIL","症状の詳細を短く入力してください");
    return {key:s.key,name,severity:s.severity,count:s.count??null,location:s.location?.trim()||null,interference:s.interference?.trim()||null};
  }).sort((a,b)=>a.key.localeCompare(b.key));
  const timestamp=now();
  return {id:previous?.id??crypto.randomUUID(),measuredAt:deviceToCase(measured),createdAt:previous?.createdAt??timestamp,updatedAt:timestamp,vitals:cleanVitals(input.vitals),symptoms};
}
function settingsFor(input:Settings) {
  if(!Array.isArray(input?.active)||input.active.length>60) throw invalid("INVALID_SYMPTOM","表示する症状を確認してください");
  const previous=data().settings, active=[...new Set(input.active)];
  const known=[...new Set([...active,...previous.active,...previous.hidden])];
  if(known.some(k=>!isKnown(k)&&!isCustom(k))) throw invalid("INVALID_SYMPTOM","表示する症状を確認してください");
  const customNames={...previous.customNames};
  for (const [k,name] of Object.entries(input.customNames??{})) {
    if(!isCustom(k)||typeof name!=="string"||!name.trim()||name.trim().length>40) throw invalid("INVALID_SYMPTOM_NAME","症状名は1〜40文字です");
    if(known.includes(k)) customNames[k]??=name.trim();
  }
  if(known.some(k=>isCustom(k)&&!customNames[k])) throw invalid("INVALID_SYMPTOM_NAME","症状名を入力してください");
  return {active,hidden:known.filter(k=>!active.includes(k)),customNames};
}
function bodyOf(value:unknown) {
  if(typeof value!=="string"||!value.trim()||value.trim().length>500) throw invalid("INVALID_NOTE","質問を1〜500文字で入力してください");
  return value.trim();
}
function dateOfVisit(value:unknown) {
  if(value===null) return null;
  const today=Date.parse(localDay(new Date())+"T00:00:00Z"), t=Date.parse(String(value)+"T00:00:00Z");
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==value||t<today-366*864e5||t>today+731*864e5) throw invalid("INVALID_VISIT_DATE","日付を確認してください（今日の1年前から2年後まで）");
  return {date:value,updatedAt:new Date().toISOString()};
}
// 本番 API と同じ任意の JSON 本文を受ける（settingsFor などで値を検証する）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nativeRecordApi(url:URL,method:string,input?:any):{handled:boolean;data?:unknown} {
  const path=url.pathname;
  const ok=(data:unknown)=>({handled:true,data});
  if(path==="/api/v1/next-visit") {
    if(method==="PUT") {data().visit=dateOfVisit(input?.date); save(false);}
    if(method==="GET"||method==="PUT") return ok({visit:data().visit});
  }
  if(path==="/api/v1/health/symptoms") {
    if(method==="PUT"){data().settings=settingsFor(input);save(false);}
    if(method==="GET"||method==="PUT") return ok({settings:clone(data().settings)});
  }
  const health=path.match(/^\/api\/v1\/health\/records(?:\/([^/]+))?$/);
  if(health) {
    const id=health[1],state=data();
    if(!id&&method==="GET") {
      const [a,b]=["from","to"].map(k=>url.searchParams.get(k));
      const records=nativeClinicianHealth().records.filter(r=>(!a||Date.parse(r.measuredAt)>=Date.parse(a))&&(!b||Date.parse(r.measuredAt)<=Date.parse(b)));
      return ok({records:records.map(patientRecord),today:nativeCaseDay()});
    }
    if(!id&&method==="POST"){const record=prepareRecord(input);state.records.push(record);save();return ok({record:patientRecord(record)});}
    const i=state.records.findIndex(r=>r.id===id);
    if(i<0) throw missing("HEALTH_RECORD_NOT_FOUND");
    if(method==="DELETE"){state.records.splice(i,1);save();return ok({deleted:true});}
    if(method==="PATCH"){const record=prepareRecord(input,state.records[i]);state.records[i]=record;save();return ok({record:patientRecord(record)});}
  }
  const notes=path.match(/^\/api\/v1\/notes(?:\/([^/]+))?$/);
  if(notes) {
    const id=notes[1],state=data();
    if(!id&&method==="GET") return ok({notes:nativeClinicianNotes().reverse().map(patientNote)});
    if(!id&&method==="POST"){
      const body=bodyOf(input?.body);
      const linked=input?.versionId?nativePatientMaterial(input.versionId):null;
      if(input?.versionId&&!linked) throw missing("VERSION_NOT_FOUND");
      if(input?.questionId&&(!linked||!patientAnsweredQuestion(linked.versionId,input.questionId))) throw invalid("QUESTION_NOT_ANSWERED","回答した設問を選んでください");
      const t=now();
      const note:Note={id:crypto.randomUUID(),body,source:linked?"quiz":"free",materialId:linked?.materialId??null,materialTitle:linked?.title??null,primaryDomain:linked?.primaryDomain??null,createdAt:t,updatedAt:t};
      state.notes.push(note);save();return ok({note:patientNote(note)});
    }
    const i=state.notes.findIndex(n=>n.id===id);
    if(i<0) throw missing("NOTE_NOT_FOUND");
    if(method==="DELETE"){state.notes.splice(i,1);save();return ok({deleted:true});}
    if(method==="PATCH"){const note={...state.notes[i],body:bodyOf(input?.body),updatedAt:now()};state.notes[i]=note;save();return ok({note:patientNote(note)});}
  }
  return {handled:false};
}
