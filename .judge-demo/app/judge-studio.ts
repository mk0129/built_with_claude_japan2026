import { useEffect, useRef, useState } from "react";
import { useStudio, type Draft, type Outline, type MustCandidate, type StudioLive } from "@/concept-d/studio";
import type { MaterialApi } from "@/concept-d/record";
import replay from "./fixtures/studio-replay.json";
import { SOURCE_DOCX } from "./fixtures/studio-source";

export const JUDGE_STUDIO_DRAFT = "bb64ff87-e91b-4ec5-813d-0f95a6f0cb7c";
const materialId = "e9db6eb4-f3cb-4a26-8873-4d1083489987";
const sourceId = replay.material.slides[0].sourceRefs[0].sourceId;
const sourceTitle = "乳がんのホルモン療法";
const replayModel = replay.model + "（" + replay.generatedOn + " の記録を再生）";
const memory = new Map<string, Draft>();

function makeDraft(): Draft {
  const m = replay.material;
  const mustCover = replay.outline.mustCoverCandidates.map((c,i) => ({
    id: "mc"+(i+1), text:c.text, kind:c.kind, sourceRef:c.sourceRef, status:"required", confirmed:true,
  }));
  return {
    version:{id:JUDGE_STUDIO_DRAFT,status:"draft",summary:m.summary,learningObjectives:[...m.learningObjectives],mustCover,reviewComment:null},
    material:{id:materialId,title:m.title,primaryDomain:m.primaryDomain,scope:"org",tags:[]},
    slides:m.slides.map((s,i)=>({
      seq:i+1,title:s.title,proposition:s.proposition,bodyMd:s.body,detailMd:s.detail,sourceRefs:s.sourceRefs,
    })),
    questions:m.questions.map((q,i)=>({
      seq:i+1,stem:q.stem,options:[...q.options] as [string,string,string],correctIndex:q.correctIndex,
      explanation:q.explanation,relatedSlideSeq:q.relatedSlide,sourceRefs:q.sourceRefs,
    })),
    sources:[{id:sourceId,title:sourceTitle,perm:{rightsHolder:"架空の院内資料",allowPublish:true,allowShare:false,allowDerive:true}}],
    creatorName:"佐藤 一郎（架空）",role:{canEdit:true,canApprove:true},
    approvalBlock:"承認待ちに提出されていません",preCheck:{mustCover:{safetyUnconfirmed:[],unconfirmed:0}},
  };
}

function read(visitId:string): Draft {
  let result = memory.get(visitId);
  if (!result) {
    try {
      const item = sessionStorage.getItem("shiori:judge:studio:"+visitId);
      if (item) {
        const candidate = JSON.parse(item) as Draft;
        if (candidate?.version?.id===JUDGE_STUDIO_DRAFT && candidate.material?.id===materialId &&
          Array.isArray(candidate.slides) && Array.isArray(candidate.questions)) result=candidate;
      }
    } catch { /* In-memory use still works in browsers without storage. */ }
    result ??= makeDraft();
    memory.set(visitId,result);
  }
  return structuredClone(result);
}
function save(visitId:string,draft:Draft) {
  memory.set(visitId,structuredClone(draft));
  try { sessionStorage.setItem("shiori:judge:studio:"+visitId,JSON.stringify(draft)); } catch {}
}

export function studioPublishedForVisit(visitId:string): MaterialApi[] {
  if(!visitId)return [];
  const d=read(visitId);
  if(d.version.status!=="published")return [];
  return [{materialId:d.material.id,versionId:d.version.id,title:d.material.title,summary:d.version.summary,
    objectives:d.version.learningObjectives,primaryDomain:d.material.primaryDomain,scope:d.material.scope,
    slideCount:d.slides.length,questionCount:d.questions.length}];
}

export function studioLessonForVisit(visitId:string, id:string) {
  if(!visitId || id!==materialId)return null;
  const d=read(visitId);
  if(d.version.status!=="published" && d.version.status!=="retired")return null;
  return {
    title:d.material.title,
    slides:d.slides.map(s=>({seq:s.seq,title:s.title,body:s.bodyMd,proposition:s.proposition??undefined,detail:s.detailMd??undefined})),
    questions:d.questions.map(q=>({seq:q.seq,stem:q.stem,options:q.options,correctIndex:q.correctIndex,explanation:q.explanation,relatedSlide:q.relatedSlideSeq??1})),
  };
}

const output = (data:unknown)=>({handled:true,data});
// 本番 API と同じ任意の JSON 本文・応答を扱う（記録済み出力の再生専用）
/* eslint-disable @typescript-eslint/no-explicit-any */
type ApiInit = RequestInit & {json?: any};
export async function studioApi(path:string, init:ApiInit = {}, visitId:string):Promise<{handled:boolean,data?:any}> {
  const {pathname}=new URL(path,"https://shiori.invalid");
  if(!pathname.startsWith("/api/v1/studio/"))return {handled:false};
  if(!visitId)throw Error("診察体験を開始してください");
  const method=(init.method??(init.json===undefined?"GET":"POST")).toUpperCase();
  const suffix=pathname.slice("/api/v1/studio/".length);
  const d=read(visitId);
  if(suffix==="config" && method==="GET") return output({claudeConfigured:false,model:replayModel});
  if(suffix==="sources" && method==="GET") return output({sources:d.sources});
  if(suffix==="materials" && method==="GET") return output({materials:[d.material]});
  const [collection,id,action] = suffix.split("/");
  if(collection!=="materials" || id!==JUDGE_STUDIO_DRAFT) throw Error("審査体験では、用意されたホルモン療法の教材を使用します");
  if(!action && method==="GET")return output(d);
  const b=init.json??{};
  if(!action && method==="PUT") {
    if(d.version.status!=="draft")throw Error("承認待ち・公開後の教材は編集できません");
    if(!b.title?.trim() || !Array.isArray(b.slides) || !b.slides.length || b.slides.length>25 ||
       !Array.isArray(b.questions) || b.questions.length>30)throw Error("教材の内容を確認してください");
    d.material.title=b.title;
    d.material.primaryDomain=b.primaryDomain;
    d.version.summary=b.summary;
    d.version.learningObjectives=b.learningObjectives;
    d.slides=b.slides.map((s:any,i:number)=>({seq:i+1,title:s.title,proposition:s.proposition,bodyMd:s.body,detailMd:s.detail,sourceRefs:s.sourceRefs}));
    d.questions=b.questions.map((q:any,i:number)=>({seq:i+1,stem:q.stem,options:q.options,correctIndex:q.correctIndex,explanation:q.explanation,relatedSlideSeq:q.relatedSlide,sourceRefs:q.sourceRefs}));
    save(visitId,d);
    return output({saved:true});
  }
  if(method==="POST"&&action==="submit"&&d.version.status==="draft"){
    d.version.status="in_review";d.version.reviewComment=null;d.approvalBlock=null;
  }else if(method==="POST"&&action==="approve"&&d.version.status==="in_review"){
    d.version.status="published";d.approvalBlock=null;
  }else if(method==="POST"&&action==="return"&&d.version.status==="in_review"){
    d.version.status="draft";d.version.reviewComment=String(b.comment??"要修正");d.approvalBlock="承認待ちに提出されていません";
  }else if(method==="POST"&&action==="retire"&&d.version.status==="published"){
    d.version.status="retired";d.approvalBlock="公開停止中です";
  }else{
    throw Error("教材の状態が変わりました。画面を再読み込みしてください");
  }
  save(visitId,d);
  return output({done:true});
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const outlineJob = {
  id:"judge-studio-outline",mode:"outline",status:"succeeded",progress:null,errorCode:null,errorMessage:null,
  generator:"replay",model:replayModel,outputPayload:replay.outline,outputVersionId:null,
};
const draftJob={...outlineJob,id:"judge-studio-draft",mode:"generate",outputPayload:replay.material,outputVersionId:JUDGE_STUDIO_DRAFT};
const fixedSource = {title:sourceTitle,filename:"乳がんのホルモン療法.docx",size:7875,charCount:1630,warnings:[] as string[]};

/** Start the genuine Studio editor when the judge opens it. All draft updates use the per-visit adapter. */
export function useJudgeStudio(orgId:string|null,enabled:boolean,notify:(s:string)=>void): StudioLive {
  const [requested,setRequested]=useState(()=>new URLSearchParams(window.location.search).get("draft")===JUDGE_STUDIO_DRAFT);
  const [sourcePresent,setSourcePresent]=useState(false);
  const setForSidebar=useRef(false);
  const live=useStudio(orgId,enabled&&requested,notify);
  useEffect(()=>{
    if(!enabled)return;
    const open=(event:Event)=>{
      const el=event.target instanceof Element ? event.target.closest("button") : null;
      // The judge case has one fictional, pre-authorized file. Never open the computer's
      // file chooser or send a selected file to a server.
      if(el?.matches(".cd-studio .cd-upload")){
        const input=el.closest(".cd-studio")?.querySelector<HTMLInputElement>("[data-source-file]");
        if(input){
          event.preventDefault();event.stopPropagation();
          const transfer=new DataTransfer();
          transfer.items.add(new File([Uint8Array.from(atob(SOURCE_DOCX),c=>c.charCodeAt(0))],fixedSource.filename,
            {type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
          input.files=transfer.files;input.dispatchEvent(new Event("change",{bubbles:true}));
          notify("審査用の架空資料を選びました。作成元には「さくら総合病院」、根拠には「架空の院内資料」と入力できます。");
        }
        return;
      }
      if(!el?.closest(".cd-sidebar") || el.textContent?.trim()!=="教材スタジオ" || requested)return;
      const url=new URL(window.location.href);
      url.searchParams.set("draft",JUDGE_STUDIO_DRAFT);
      history.replaceState(history.state,"",url);
      setForSidebar.current=true;
      setRequested(true);
    };
    document.addEventListener("click",open,true);
    return ()=>document.removeEventListener("click",open,true);
  },[enabled,requested,notify]);
  useEffect(()=>{
    if(!setForSidebar.current || !live.openedFromUrl)return;
    const url=new URL(window.location.href);url.searchParams.delete("draft");
    history.replaceState(history.state,"",url);
    setForSidebar.current=false;
  },[live.openedFromUrl]);
  const recordedOnly=()=>{notify("審査用に用意した院内資料と、記録済みのClaude出力を使用します。");};
  return {
    ...live, sourceId:sourcePresent?sourceId:null,sourceInfo:sourcePresent?fixedSource:null,
    outlineJob:requested?outlineJob:null,draftJob:requested?draftJob:null,
    outlines:requested?replay.outline.outlines as Outline[]:[],
    candidates:requested?replay.outline.mustCoverCandidates.map((c,i)=>({...c,id:"mc"+(i+1)})) as MustCandidate[]:[],
    // Arbitrary uploads and live AI are not enabled for a publicly accessible fictional exercise.
    upload:async(file,meta)=>{
      if(file.size!==fixedSource.size || !meta.piiAttestedNone || !meta.perm.allowAi){recordedOnly();return null;}
      const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
      const hash=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
      if(hash!==replay.sourceSha256){recordedOnly();return null;}
      setSourcePresent(true);return sourceId;
    },
    updatePermissions:async()=>{recordedOnly();return null;},
    removeSource:()=>{setSourcePresent(false);},
    requestOutlines:async()=>sourcePresent?outlineJob:null,
    requestFreeform:async()=>{recordedOnly();return null;},
    requestDraft:async()=>{const d=await live.reloadDraft();return d?draftJob:null;},
  };
}
