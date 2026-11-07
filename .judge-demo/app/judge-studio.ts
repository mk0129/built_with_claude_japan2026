import { useState } from "react";
import { useStudio, type Draft, type Outline, type MustCandidate, type Permissions, type StudioLive, type StudioSample } from "@/concept-d/studio";
import type { MaterialApi } from "@/concept-d/record";
import replay from "./fixtures/studio-replay.json";
import { SOURCE_DOCX, SOURCE_TEXT } from "./fixtures/studio-source";
import { getJudgeSession } from "./judge-store";

export const JUDGE_STUDIO_DRAFT = "bb64ff87-e91b-4ec5-813d-0f95a6f0cb7c";
const materialId = "e9db6eb4-f3cb-4a26-8873-4d1083489987";
const sourceId = replay.material.slides[0].sourceRefs[0].sourceId;
const sourceTitle = "乳がんのホルモン療法を受ける方へ（患者さん向け説明資料・デモ）";
const rightsHolder = "あおば記念病院（架空） 乳腺センター・薬剤部";
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
    sources:[{id:sourceId,title:sourceTitle,perm:{rightsHolder,allowPublish:true,allowShare:false,allowDerive:true}}],
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

/** 原資料の利用条件を、この体験の下書きに反映する（登録時・公開前の確認） */
function setSourcePermission(visitId:string, perm:Permissions) {
  if(!visitId)return;
  const d=read(visitId);
  d.sources=d.sources.map(x=>({...x,perm:{rightsHolder,allowPublish:perm.allowPublish,allowShare:perm.allowShare,allowDerive:perm.allowDerive}}));
  save(visitId,d);
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
  if(!action && method==="GET"){
    // 公開の許可は承認の段階で確認する（本番の承認条件と同じ）
    if(d.version.status==="in_review")d.approvalBlock=d.sources.some(x=>!x.perm?.allowPublish)?"原資料に患者向け公開の許可がありません":null;
    return output(d);
  }
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
    if(d.sources.some(x=>!x.perm?.allowPublish))throw Error("原資料に患者向け公開の許可がありません");
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
const sourceFile = () => new File([Uint8Array.from(atob(SOURCE_DOCX),c=>c.charCodeAt(0))],fixedSource.filename,
  {type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
/** 審査用のサンプル資料（架空）。資料名・作成元・許諾の根拠は、資料内の作成元表示と審査デモの前提に合わせる */
export const JUDGE_SAMPLE: StudioSample = {
  title: sourceTitle,
  filename: fixedSource.filename,
  rightsHolder,
  evidenceNote: "資料内の作成元表示を確認した。審査デモ用に作成した架空のオリジナル資料で、AI処理と患者向けへの書き直しを許可（架空の許諾）。",
  description: "ハッカソンの動作検証用に作った架空の説明資料（Word・約1,600字・9項目）。実在の病院・患者とは関係ありません。",
  file: sourceFile,
};

/**
 * 審査デモの教材スタジオ。サンプル資料（架空）を手順 1 から使い、構成案・下書きは記録済みの Claude 出力を再生する。
 * 任意のファイルの読み込みと Claude の呼び出しは行わない。下書きの編集・承認はこの体験（タブ）の中だけで保存する。
 */
export function useJudgeStudio(orgId:string|null,enabled:boolean,notify:(s:string)=>void,info:(s:string)=>void=notify): StudioLive {
  const [sourcePerm,setSourcePerm]=useState<Permissions|null>(null);
  const [outlined,setOutlined]=useState(false);
  const [drafted,setDrafted]=useState(()=>new URLSearchParams(window.location.search).get("draft")===JUDGE_STUDIO_DRAFT);
  const live=useStudio(orgId,enabled,notify);
  const visitId=()=>getJudgeSession()?.id ?? "";
  const recordedOnly=()=>{info("公開デモでは、サンプル資料と記録済みのClaude出力だけを使います。");};
  const { openDraft, reloadDraft } = live;
  return {
    ...live, sourceId:sourcePerm?sourceId:null,sourceInfo:sourcePerm?fixedSource:null,
    outlineJob:outlined?outlineJob:null,draftJob:drafted?draftJob:null,
    outlines:outlined?replay.outline.outlines as Outline[]:[],
    candidates:outlined?replay.outline.mustCoverCandidates.map((c,i)=>({...c,id:"mc"+(i+1)})) as MustCandidate[]:[],
    replay:true,
    sample:JUDGE_SAMPLE,
    ownFileBlockedReason:"公開デモでは自分のファイルは選べません（Claudeを呼び出さないため）。上のサンプル資料で手順を試せます。",
    sourceText:SOURCE_TEXT,
    // Arbitrary uploads and live AI are not enabled for a publicly accessible fictional exercise.
    upload:async(file,meta)=>{
      if(file.size!==fixedSource.size || !meta.piiAttestedNone){recordedOnly();return null;}
      const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
      const hash=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
      if(hash!==replay.sourceSha256){recordedOnly();return null;}
      setSourcePerm(meta.perm);setOutlined(false);
      return sourceId;
    },
    updatePermissions:async(meta)=>{
      setSourcePerm(meta.perm);setSourcePermission(visitId(),meta.perm);
      await reloadDraft();
      return {updated:true};
    },
    removeSource:()=>{setSourcePerm(null);setOutlined(false);},
    requestOutlines:async()=>{
      if(!sourcePerm)return null;
      if(!sourcePerm.allowAi || !sourcePerm.allowDerive){info("AI処理と改変の許可がない資料は、Claudeの構成案に使えません。");return null;}
      setOutlined(true);return outlineJob;
    },
    requestFreeform:async()=>{recordedOnly();return null;},
    requestDraft:async()=>{
      if(sourcePerm)setSourcePermission(visitId(),sourcePerm);
      const d=await openDraft(JUDGE_STUDIO_DRAFT);
      if(!d)return null;
      setDrafted(true);return draftJob;
    },
  };
}
