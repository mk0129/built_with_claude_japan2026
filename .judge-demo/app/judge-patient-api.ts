import type { LibraryApiItem, AttemptView } from "@/concept-d/learning";
import fixture from "./fixtures/consultation.json";
import lessonsJson from "./fixtures/lessons.json";
import figuresJson from "./fixtures/patient-figures.json";
import { ApiError } from "./judge-errors";
import { getJudgeSession, type Delivery } from "./judge-store";
import { studioLessonForVisit, studioPublishedForVisit } from "./judge-studio";
import { nativeShareApi } from "./judge-patient-share";
export { getNativePatientGrant } from "./judge-patient-share";

type Lesson = {title:string; slides:{seq:number;title:string;body:string;proposition?:string;detail?:string}[];
  questions:{seq:number;stem:string;options:string[];correctIndex:number;explanation:string;relatedSlide:number}[]};
type Figure = {src:string;altText:string;caption:string;longDescription:string;width:number;height:number};
type Progress = {phase:LibraryApiItem["phase"];lastSlideSeq:number};
type Item = LibraryApiItem;
type SavedAnswer = {id:string;questionId:string;seq:number;selectedIndex:number|null;at:string};
type Attempt = {id:string;versionId:string;completedAt:string|null;answers:SavedAnswer[]};
type DeliveredLesson = {item:Item; lesson:Lesson};
type Receipt = {id:string;createdAt:string;items:Delivery[]};
type PatientState = {progress:Record<string,Progress>;attempts:Attempt[];receipts:Receipt[];deliveredLessons:Record<string,DeliveredLesson>};
const lessons:Record<string,Lesson>=lessonsJson;
const figures:Record<string,Record<string,Figure[]>>=figuresJson;
const storageKey="shiori:judge:patient-native:v1";
const ok=(data:unknown)=>({handled:true,data});
const bad=(code:string)=>new ApiError(400,code);
const inaccessible=()=>new ApiError(403,"NOT_AVAILABLE");
const direct=fixture.library.items.map(i=>({...i,objective:fixture.materials.items.find(m=>m.materialId===i.materialId)?.objectives[0]??null})) as Item[];
let cached:PatientState|undefined;
function state():PatientState {
  if(cached)return cached;
  try{const s=sessionStorage.getItem(storageKey);if(s)cached=JSON.parse(s);}catch{}
  cached??={progress:{},attempts:[],receipts:[],deliveredLessons:{}};
  return cached;
}
function save(){const s=state();try{sessionStorage.setItem(storageKey,JSON.stringify(s));}catch{}}
function caseNow(){
  const now=new Date();
  return new Date(+now-now.getTimezoneOffset()*60000-9*3600000).toISOString();
}
function rememberStudio(visitId:string,materialId:string) {
  const m=studioPublishedForVisit(visitId).find(m=>m.materialId===materialId);
  const lesson=studioLessonForVisit(visitId,materialId);
  if(!m || !lesson)return;
  const item:Item={...m, objective:m.objectives[0]??null,scope:m.scope as Item["scope"],prescribed:null,selfLearning:false,
    phase:"not_started",lastSlideSeq:0,nCorrect:0,nWrong:0,nUnknown:0,completedAt:null};
  state().deliveredLessons[m.versionId]={item,lesson};
}
export function rememberNativeDeliveries() {
  const visit=getJudgeSession();if(!visit?.prescriptions.length)return;
  const s=state(),old=s.receipts.find(r=>r.id===visit.id);
  if(old?.items.length===visit.prescriptions.length)return;
  for(const row of visit.prescriptions)if(!lessons[row.materialId])rememberStudio(visit.id,row.materialId);
  s.receipts=[{id:visit.id,createdAt:visit.prescriptions[0].prescribedAt,items:structuredClone(visit.prescriptions)},...s.receipts.filter(r=>r.id!==visit.id)];
  save();
}
function visibleItems() {
  return [...direct,...Object.values(state().deliveredLessons).map(d=>d.item)];
}
export function nativePatientMaterial(versionId:string) {
  return visibleItems().find(item=>item.versionId===versionId);
}
function content(versionId:string) {
  const item=nativePatientMaterial(versionId);
  if(!item)throw inaccessible();
  const lesson=state().deliveredLessons[versionId]?.lesson??lessons[item.materialId];
  if(!lesson)throw inaccessible();
  return {lesson,item};
}
function questionId(versionId:string,seq:number) {
  return fixture.patient.answers.find(a=>a.versionId===versionId && a.seq===seq)?.questionId??versionId+"-q"+seq;
}
function legacyReadingPosition(item:Item):number|undefined {
  const prefix="shiori:judge:patient:v1:", visit=getJudgeSession();
  const keys=new Set<string>();
  if(lessons[item.materialId])keys.add(prefix+"intro");
  if(visit)keys.add(prefix+visit.id);
  // The first public reader kept shared lessons under the visit that was open.
  // A custom studio lesson belongs only to the visit in which it was edited.
  try {
    if(lessons[item.materialId]){
      for(let n=sessionStorage.length-1;n>=0;n--){
        const key=sessionStorage.key(n);
        if(key?.startsWith(prefix))keys.add(key);
      }
    }
    for(const key of keys){
      try {
        const entry=JSON.parse(sessionStorage.getItem(key)??"{}")?.[item.materialId];
        if(Number.isInteger(entry?.page) && entry.page>=0 && entry.page<item.slideCount)return entry.page+1;
      } catch { /* A stale bookshelf can be skipped independently. */ }
    }
  } catch { /* A fresh viewer has no former reading position. */ }
  return undefined;
}
function progress(item:Item):Progress {
  const explicit=state().progress[item.versionId];
  if(explicit)return explicit;
  // Legacy answers had no dates or attempt IDs; only the reading position can
  // be carried forward without manufacturing events in the doctor's timeline.
  const position=legacyReadingPosition(item);
  if(position!==undefined)return {phase:item.phase==="completed"?"completed":"reading",lastSlideSeq:position};
  return {phase:item.phase,lastSlideSeq:item.lastSlideSeq};
}
function library() {
  rememberNativeDeliveries();
  const s=state();
  const sets=s.receipts.map(r=>({setId:r.id,createdAt:r.createdAt,orgName:fixture.session.orgName,clinicianName:fixture.session.clinicianName,
    templates:fixture.templates.templates.filter(t=>t.materials.length && t.materials.every(m=>r.items.some(i=>i.materialId===m.id)))
      .map(t=>({id:t.id,name:t.name,description:t.description,materialIds:t.materials.map(m=>m.id)}))}));
  const items=visibleItems().map(base=>{
    const rc=s.receipts.find(r=>r.items.some(d=>d.materialId===base.materialId));
    const rx=rc?.items.find(i=>i.materialId===base.materialId);
    const prescribed=rc&&rx?{setId:rc.id,createdAt:rx.prescribedAt,orgName:fixture.session.orgName,clinicianName:fixture.session.clinicianName,
      latest:rc.id===s.receipts[0]?.id,note:rx.note||null}:base.prescribed?{...base.prescribed,latest:!s.receipts.length&&base.prescribed.latest}:null;
    const completed=s.attempts.find(a=>a.versionId===base.versionId && a.completedAt);
    const counts=completed ? attemptView(completed) : base;
    const p=progress(base);
    return {...base,...p,prescribed,selfLearning:!prescribed && (base.selfLearning||p.phase!=="not_started"),
      nCorrect:counts.nCorrect,nWrong:counts.nWrong,nUnknown:counts.nUnknown,completedAt:completed?.completedAt??base.completedAt};
  });
  return {items,latestSetId:sets[0]?.setId??fixture.library.latestSetId,latestSetTemplates:sets[0]?.templates??fixture.library.latestSetTemplates,
    prescribedSets:[...sets,...fixture.library.prescribedSets]};
}
function learnView(versionId:string) {
  const {item,lesson}=content(versionId);
  return {versionId,title:item.title,progress:progress(item),questionCount:lesson.questions.length,
    slides:lesson.slides.map(sl=>({seq:sl.seq,title:sl.title,bodyMd:sl.body,proposition:sl.proposition??null,
      detailMd:sl.detail??null,voiceText:sl.body,figures:figures[item.title]?.[String(sl.seq)]??[]}))};
}
function saveProgress(versionId:string,body:Record<string,unknown>) {
  const {item,lesson}=content(versionId);
  const seq=body.lastSlideSeq,phase=body.phase;
  if(typeof seq!=="number" || !Number.isInteger(seq)||seq<0||seq>lesson.slides.length || (phase!=="reading"&&phase!=="quiz"&&phase!=="completed"))throw bad("INVALID_PROGRESS");
  if(phase==="completed" && lesson.questions.length && !state().attempts.some(a=>a.versionId===versionId&&a.completedAt) && item.phase!=="completed")throw bad("QUIZ_INCOMPLETE");
  state().progress[versionId]={phase,lastSlideSeq:seq};save();return {ok:true};
}
function attemptView(a:Attempt):AttemptView {
  const {lesson}=content(a.versionId);
  let nCorrect=0,nWrong=0,nUnknown=0;
  const questions=lesson.questions.map(q=>{
    const id=questionId(a.versionId,q.seq),response=a.answers.find(x=>x.questionId===id);
    const answer=response?{selectedIndex:response.selectedIndex,isUnknown:response.selectedIndex===null,
      isCorrect:response.selectedIndex===q.correctIndex,correctIndex:q.correctIndex,explanation:q.explanation}:null;
    if(answer){if(answer.isUnknown)nUnknown++;else if(answer.isCorrect)nCorrect++;else nWrong++;}
    return {questionId:id,seq:q.seq,stem:q.stem,options:q.options as [string,string,string],relatedSlideSeq:q.relatedSlide,answer};
  });
  return {attemptId:a.id,versionId:a.versionId,completedAt:a.completedAt,nQuestions:questions.length,questions,nCorrect,nWrong,nUnknown};
}
function seededAttempt(versionId:string):Attempt|undefined {
  const {item,lesson}=content(versionId);const rows=fixture.patient.answers.filter(a=>a.versionId===versionId);
  if(!rows.length)return;
  const latest=rows[rows.length-1];
  const answers=rows.filter(a=>a.attemptId===latest.attemptId).map(a=>{
    const q=lesson.questions.find(q=>q.seq===a.seq)!;
    const index=a.isUnknown?null:q.options.indexOf(a.selectedText??"");
    return {id:a.questionId,questionId:a.questionId,seq:a.seq,selectedIndex:index,at:a.answeredAt};
  });
  return {id:latest.attemptId,versionId,answers,completedAt:latest.attemptCompleted?item.completedAt:null};
}
function startAttempt(versionId:string,forceNew:boolean) {
  const {lesson}=content(versionId);
  if(!lesson.questions.length)throw bad("NO_QUESTIONS");
  const latest=state().attempts.find(a=>a.versionId===versionId)??seededAttempt(versionId);
  if(latest && (!forceNew||!latest.completedAt))return attemptView(latest);
  const a:Attempt={id:crypto.randomUUID(),versionId,answers:[],completedAt:null};
  state().attempts.unshift(a);state().progress[versionId]={phase:"quiz",lastSlideSeq:lesson.slides.length};save();return attemptView(a);
}
function findAttempt(id:string) {
  const saved=state().attempts.find(a=>a.id===id);
  if(saved)return saved;
  const row=fixture.patient.answers.find(a=>a.attemptId===id);
  if(row){const seeded=seededAttempt(row.versionId);if(seeded?.id===id)return seeded;}
  throw new ApiError(404,"ATTEMPT_NOT_FOUND");
}
function answer(a:Attempt,body:Record<string,unknown>) {
  if(a.completedAt)throw new ApiError(409,"ATTEMPT_COMPLETED");
  const {lesson}=content(a.versionId);
  const q=lesson.questions.find(q=>questionId(a.versionId,q.seq)===body.questionId);
  if(!q)throw bad("QUESTION_NOT_IN_ATTEMPT");
  const idx=body.selectedIndex;
  if(idx!==null && (typeof idx!=="number"||!Number.isInteger(idx)||idx<0||idx>=q.options.length))throw bad("INVALID_OPTION");
  if(a.answers.some(x=>x.seq===q.seq))throw new ApiError(409,"ANSWER_ALREADY_SUBMITTED");
  const at=caseNow();
  a.answers.push({id:crypto.randomUUID(),questionId:questionId(a.versionId,q.seq),seq:q.seq,selectedIndex:idx as number|null,at});
  if(a.answers.length===lesson.questions.length){a.completedAt=at;state().progress[a.versionId]={phase:"completed",lastSlideSeq:lesson.slides.length};}
  if(!state().attempts.includes(a))state().attempts.unshift(a);
  save();return {isCorrect:idx===q.correctIndex,isUnknown:idx===null,correctIndex:q.correctIndex,explanation:q.explanation,completed:!!a.completedAt};
}
export function patientAnsweredQuestion(versionId:string,id:string) {
  return fixture.patient.answers.some(x=>x.versionId===versionId&&x.questionId===id)
    ||state().attempts.some(a=>a.versionId===versionId&&a.answers.some(x=>x.questionId===id));
}
export function patientLearningChanges() {
  return state().attempts.flatMap(a=>{
    const {item,lesson}=content(a.versionId);
    return a.answers.filter(r=>!fixture.patient.answers.some(x=>r.id===x.questionId)).map(r=>{
      const q=lesson.questions.find(q=>q.seq===r.seq)!;
      return {answerId:r.id,attemptId:a.id,attemptCompleted:!!a.completedAt,seq:r.seq,materialId:item.materialId,versionId:a.versionId,
        materialTitle:item.title,primaryDomain:item.primaryDomain,questionId:r.questionId,stem:q.stem,isCorrect:r.selectedIndex===q.correctIndex,
        isUnknown:r.selectedIndex===null,selectedText:r.selectedIndex===null?null:q.options[r.selectedIndex],
        correctText:q.options[q.correctIndex],explanation:q.explanation,relatedSlideSeq:q.relatedSlide,answeredAt:r.at};
    });
  });
}
export function patientApi(url:URL,method:string,input?:unknown):{handled:boolean;data?:unknown} {
  const body=(input && typeof input==="object"?input:{}) as Record<string,unknown>;
  const share=nativeShareApi(url,method,body);if(share.handled)return share;
  const path=url.pathname;
  if(path==="/api/v1/library" && method==="GET")return ok(library());
  const lesson=path.match(/^\/api\/v1\/learn\/([^/]+)(?:\/(progress|attempts))?$/);
  if(lesson){
    if(!lesson[2]&&method==="GET")return ok(learnView(lesson[1]));
    if(lesson[2]==="progress" && method==="POST")return ok(saveProgress(lesson[1],body));
    if(lesson[2]==="attempts" && method==="POST")return ok(startAttempt(lesson[1],body.forceNew===true));
  }
  const attempt=path.match(/^\/api\/v1\/attempts\/([^/]+)(?:\/(answers))?$/);
  if(attempt){
    if(!attempt[2]&&method==="GET")return ok(attemptView(findAttempt(attempt[1])));
    if(attempt[2]==="answers"&&method==="POST")return ok(answer(findAttempt(attempt[1]),body));
  }
  return {handled:false};
}
