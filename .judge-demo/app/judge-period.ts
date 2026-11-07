import { ApiError } from "./judge-errors";
import { ruleSummary, sourceIndex } from "./judge-period-rules";
import { fmtDate } from "@/server/services/intervisit-format";
import type { Intervisit } from "@/server/services/intervisit";
import type { IntervisitApi } from "@/concept-d/record";
import fixture from "./fixtures/consultation.json";

type PeriodPayload = Omit<IntervisitApi,"intervisit"> & { intervisit: Intervisit };
const first = fixture.intervisit.intervisit.period.from;
const last = fixture.intervisit.intervisit.period.to;
const dayMs = 86400000;
let ranges: Promise<Record<string, PeriodPayload>> | undefined;
function getRanges() {
  return ranges ??= fetch(new URL("fixtures/periods.json", document.baseURI)).then(async (res) => {
    if (!res.ok) throw new ApiError(503,"RECORDS_UNAVAILABLE","架空症例の期間別データを読み込めませんでした");
    return await res.json() as Record<string, PeriodPayload>;
  }).catch(error => { ranges = undefined; throw error; });
}
function dayRange(from:string,to:string):string[] {
  const a=Date.parse(from+"T00:00:00Z"), b=Date.parse(to+"T00:00:00Z");
  const check=(s:string,n:number)=> /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(n) && new Date(n).toISOString().slice(0,10)===s;
  if (!check(from,a) || !check(to,b) || a>b || to>last || (b-a)/dayMs>=92)
    throw new ApiError(400,"INVALID_PERIOD","開始日・終了日を確認してください（92日以内）");
  return Array.from({length:Math.round((b-a)/dayMs)+1},(_,i)=>new Date(a+i*dayMs).toISOString().slice(0,10));
}
export async function periodPayload(from?:string|null,to?:string|null):Promise<PeriodPayload> {
  if (!from && !to) return fixture.intervisit as unknown as PeriodPayload;
  const end=to || last;
  const start=from || new Date(Date.parse(end+"T00:00:00Z")-13*dayMs).toISOString().slice(0,10);
  const days=dayRange(start,end);
  const snapshots=await getRanges();
  if (snapshots[start+"/"+end]) return snapshots[start+"/"+end];
  // The public case contains 14 days. Earlier days legitimately have no records
  // in this case. Use only the original captures that overlap the chosen range.
  const overlaps=end>=first;
  const data=structuredClone(snapshots[overlaps?first+"/"+end:first+"/"+first]);
  const iv=data.intervisit;
  if (!overlaps) {
    iv.events=[];iv.questions=[];iv.symptoms=[];iv.learning=[];
    iv.vitals.recordCount=0;iv.vitals.recordDays=0;
    for(const metric of Object.values(iv.vitals.metrics)){
      metric.values=[];metric.count=0;metric.measuredDays=0;metric.min=null;metric.max=null;
    }
  }
  iv.period={from:start,to:end,days:days.length,isDefault:false,label:"指定期間"};
  iv.fmt = {from:fmtDate(new Date(start+"T12:00:00+09:00")),to:fmtDate(new Date(end+"T12:00:00+09:00"))};
  const recordedDays=new Set(iv.events.filter(e=>e.kind==="symptom"||e.kind==="vital").map(e=>e.day));
  iv.vitals.totalDays=days.length;
  iv.vitals.missingDays=days.filter(day=>!recordedDays.has(day));
  return {intervisit:iv,ruleSummary:ruleSummary(iv),sources:Object.fromEntries(sourceIndex(iv))};
}
