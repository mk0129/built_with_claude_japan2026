import { useEffect, useRef, useState } from "react";
import { useStudio, type Draft, type Outline, type MustCandidate, type StudioLive } from "@/concept-d/studio";
import type { MaterialApi } from "@/concept-d/record";
import replay from "./fixtures/studio-replay.json";
import { SOURCE_DOCX } from "./fixtures/studio-source";
import { SAMPLE_SOURCE_TEXT, SAMPLE_SOURCE_TITLE } from "./fixtures/studio-source-text";
import { getJudgeSession } from "./judge-store";

/**
 * 公開デモで実際に Claude を呼ぶモード（任意）。
 * Vercel の小さなサーバー関数 /api/studio（鍵はサーバーにだけ）に、合言葉と原資料の本文を送って
 * 構成案と下書きを作る。切り替えと原資料はこの端末のセッションの間だけ保持する。
 */
type LiveState = { passcode: string; model: string };
type LiveSource = { title: string; text: string; filename: string; size: number; charCount: number };
const LIVE_KEY = "shiori:judge:studio-live";
const LIVE_SOURCE_ID = "judge-src";
function liveState(): LiveState | null {
  try { const raw = sessionStorage.getItem(LIVE_KEY); return raw ? (JSON.parse(raw) as LiveState) : null; } catch { return null; }
}
function setLiveState(v: LiveState | null) {
  try { if (v) sessionStorage.setItem(LIVE_KEY, JSON.stringify(v)); else sessionStorage.removeItem(LIVE_KEY); } catch {}
}
let availability: Promise<{ configured: boolean; model: string }> | null = null;
/** サーバー関数が設定済みか（鍵・合言葉の有無だけ。値は返らない）。静的配信だけのときは 404 → 使えない */
function liveAvailable() {
  availability ??= fetch("/api/studio", { method: "GET", cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as { configured: boolean; model: string }) : { configured: false, model: "" }))
    .catch(() => ({ configured: false, model: "" }));
  return availability;
}
async function liveCall<T>(body: Record<string, unknown>): Promise<T> {
  const st = liveState();
  if (!st) throw new Error("合言葉を入れてください");
  const r = await fetch("/api/studio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, passcode: st.passcode }) });
  const data = (await r.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!r.ok) throw new Error(data.error?.message ?? `Claude の呼び出しに失敗しました（${r.status}）`);
  return data;
}
type GeneratedMaterial = { title: string; summary: string; primaryDomain: string; learningObjectives: string[]; slides: { title: string; proposition: string; body: string; detail: string; sourceRefs: { sourceId: string; section: string; quote: string }[] }[]; questions: { stem: string; options: string[]; correctIndex: number; explanation: string; relatedSlide: number; sourceRefs: { sourceId: string; section: string; quote: string }[] }[] };
/** 実際に生成した下書きを、審査用デモの教材（ID は固定）として保存できる形に */
function draftFromGenerated(m: GeneratedMaterial, source: LiveSource, must: { id: string; text: string; kind: string; sourceRef: { sourceId: string; section?: string; quote?: string }; status: string }[]): Draft {
  return {
    version: { id: JUDGE_STUDIO_DRAFT, status: "draft", summary: m.summary, learningObjectives: [...m.learningObjectives], mustCover: must.map((c) => ({ id: c.id, text: c.text, kind: c.kind as MustCandidate["kind"], sourceRef: c.sourceRef, status: c.status, confirmed: c.status === "required" })), reviewComment: null },
    material: { id: materialId, title: m.title, primaryDomain: m.primaryDomain, scope: "org", tags: [] },
    slides: m.slides.map((sl, i) => ({ seq: i + 1, title: sl.title, proposition: sl.proposition, bodyMd: sl.body, detailMd: sl.detail, sourceRefs: sl.sourceRefs })),
    questions: m.questions.map((q, i) => ({ seq: i + 1, stem: q.stem, options: [q.options[0] ?? "", q.options[1] ?? "", q.options[2] ?? ""] as [string, string, string], correctIndex: q.correctIndex, explanation: q.explanation, relatedSlideSeq: q.relatedSlide, sourceRefs: q.sourceRefs })),
    sources: [{ id: LIVE_SOURCE_ID, title: source.title, perm: { rightsHolder: "公開デモの原資料", allowPublish: true, allowShare: false, allowDerive: true } }],
    creatorName: "佐藤 一郎（架空）", role: { canEdit: true, canApprove: true },
    approvalBlock: "承認待ちに提出されていません", preCheck: { mustCover: { safetyUnconfirmed: [], unconfirmed: 0 } },
  } as Draft;
}

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 審査用デモの shim（本番の型に縛らない）
type ApiInit = RequestInit & {json?: any};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 審査用デモの shim（本番の型に縛らない）
export async function studioApi(path:string, init:ApiInit = {}, visitId:string):Promise<{handled:boolean,data?:any}> {
  const {pathname}=new URL(path,"https://shiori.invalid");
  if(!pathname.startsWith("/api/v1/studio/"))return {handled:false};
  if(!visitId)throw Error("診察体験を開始してください");
  const method=(init.method??(init.json===undefined?"GET":"POST")).toUpperCase();
  const suffix=pathname.slice("/api/v1/studio/".length);
  const d=read(visitId);
  if(suffix==="config" && method==="GET") {
    const lv=liveState(); const avail=await liveAvailable();
    return output({claudeConfigured:!!lv,model:lv?lv.model:replayModel,demoClaude:{available:avail.configured,live:!!lv}});
  }
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 審査用デモの shim（本番の型に縛らない）
    d.slides=b.slides.map((s:any,i:number)=>({seq:i+1,title:s.title,proposition:s.proposition,bodyMd:s.body,detailMd:s.detail,sourceRefs:s.sourceRefs}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 審査用デモの shim（本番の型に縛らない）
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

const outlineJob = {
  id:"judge-studio-outline",mode:"outline",status:"succeeded",progress:null,errorCode:null,errorMessage:null,
  generator:"replay",model:replayModel,outputPayload:replay.outline,outputVersionId:null,
};
const draftJob={...outlineJob,id:"judge-studio-draft",mode:"generate",outputPayload:replay.material,outputVersionId:JUDGE_STUDIO_DRAFT};
const fixedSource = {title:sourceTitle,filename:"乳がんのホルモン療法.docx",size:7875,charCount:1630,warnings:[] as string[]};
void SOURCE_DOCX;

/** Start the genuine Studio editor when the judge opens it. All draft updates use the per-visit adapter. */
export function useJudgeStudio(orgId:string|null,enabled:boolean,notify:(s:string)=>void): StudioLive {
  const [requested,setRequested]=useState(()=>new URLSearchParams(window.location.search).get("draft")===JUDGE_STUDIO_DRAFT);
  const [sourcePresent,setSourcePresent]=useState(false);
  // 再生モードでも「読み取り → 構成 → 下書き」の進み具合を短く見せる（記録済み出力なので待ち時間はほぼない）
  const [replayBusy,setReplayBusy]=useState<"outline"|"draft"|null>(null);
  const pause=(ms:number)=>new Promise<void>((r)=>window.setTimeout(r,ms));
  const [chosen,setChosen]=useState<typeof fixedSource|null>(null);
  // 実際に Claude で作るモード（公開デモ・合言葉あり）
  const [liveMode,setLiveMode]=useState<LiveState|null>(()=>liveState());
  const [liveSource,setLiveSource]=useState<LiveSource|null>(null);
  // 登録（upload）の直後に同じ操作で構成案を依頼するため、state の反映を待たずに参照できる ref も持つ
  const liveSourceRef=useRef<LiveSource|null>(null);
  const setSource=(v:LiveSource|null)=>{liveSourceRef.current=v;setLiveSource(v);};
  const [liveBusy,setLiveBusy]=useState<string|null>(null);
  const [liveOutline,setLiveOutline]=useState<{outlines:Outline[];mustCoverCandidates:Omit<MustCandidate,"id">[]}|null>(null);
  const [liveDraftReady,setLiveDraftReady]=useState(false);
  const [liveAvail,setLiveAvail]=useState(false);
  useEffect(()=>{ if(enabled) void liveAvailable().then(a=>setLiveAvail(a.configured)); },[enabled]);
  const visitId=getJudgeSession()?.id??"";
  const liveJob=(mode:"outline"|"generate",payload:unknown,versionId:string|null)=>({id:"judge-live-"+mode,mode,status:"succeeded" as const,progress:null,errorCode:null,errorMessage:null,generator:"claude" as const,model:liveMode?.model??"claude",outputPayload:payload,outputVersionId:versionId});
  const liveOutlineJob=liveMode&&liveOutline?liveJob("outline",liveOutline,null):null;
  const liveDraftJob=liveMode&&liveDraftReady?liveJob("generate",null,JUDGE_STUDIO_DRAFT):null;
  // 原資料の本文: TXT / Markdown はブラウザで読み、PDF / Word / PowerPoint はサーバー関数で本番と同じ抽出をする（OCR なし）
  const readSourceText=async(file:File):Promise<{text:string;warnings:string[]}|null>=>{
    const isText=/\.(txt|md|markdown)$/i.test(file.name)||file.type.startsWith("text/");
    if(isText){
      const text=(await file.text()).slice(0,20000);
      if(text.trim().length<50){notify("原資料の本文が短すぎます（50 文字以上）");return null;}
      return {text,warnings:[]};
    }
    if(!/\.(pdf|docx|pptx)$/i.test(file.name)){notify("PDF・Word（.docx）・PowerPoint（.pptx）・テキストに対応しています");return null;}
    if(file.size>3.5*1024*1024){notify("公開デモでは 3.5MB までのファイルに対応しています（本番は 15MB）");return null;}
    setLiveBusy("upload");
    try{
      const contentBase64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]??"");r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
      const ex=await liveCall<{text:string;charCount:number;warnings:string[];piiHints:string[]}>({mode:"extract",filename:file.name,mime:file.type,contentBase64});
      if(ex.text.trim().length<50){notify("本文をほとんど取り出せませんでした（画像だけの PDF は読み取れません）");return null;}
      const warnings=[...ex.warnings];
      if(ex.piiHints.length)warnings.push("個人情報らしい記述が含まれている可能性があります: "+ex.piiHints.join("、"));
      return {text:ex.text,warnings};
    }catch(e){notify(e instanceof Error?e.message:"ファイルを読み取れませんでした");return null;}
    finally{setLiveBusy(null);}
  };
  // 審査用デモ: 作成元・利用許諾の根拠が空なら例文を入れる（手元のファイルでもサンプルでも、確認のチェックだけで進められるように）
  const autofillSourceMeta=()=>{
    const fields=document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>(".cd-studio .cd-form-grid input, .cd-studio .cd-form-grid textarea");
    const fill=(field:HTMLInputElement|HTMLTextAreaElement|undefined,value:string)=>{
      if(!field||field.value)return;
      const proto=field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,"value")?.set?.call(field,value);
      field.dispatchEvent(new Event("input",{bubbles:true}));
    };
    fill(fields[1],"さくら総合病院（架空）");
    fill(fields[2] as HTMLTextAreaElement,"架空の院内資料のため、教材化と患者への公開を確認済み（デモ）");
  };
  // サンプル原資料（架空）を、画面のファイル入力に実際のファイルとして入れる（本番と同じ手順で進められる。ライブ・再生の両方）
  const useSample=()=>{
    const input=document.querySelector<HTMLInputElement>(".cd-studio [data-source-file]");
    if(!input){notify("手順 1（原資料）で押してください");return;}
    const dt=new DataTransfer();
    dt.items.add(new File([SAMPLE_SOURCE_TEXT],"hormone_therapy_demo.txt",{type:"text/plain"}));
    input.files=dt.files;
    input.dispatchEvent(new Event("change",{bubbles:true}));
    window.setTimeout(autofillSourceMeta,0);
    notify(liveState()?`サンプル原資料（架空・${SAMPLE_SOURCE_TITLE}）を選びました。確認にチェックして「Claudeで教材を作る」へ`:`サンプル原資料（架空・${SAMPLE_SOURCE_TITLE}）を選びました。確認にチェックして「Claudeで教材を作る」へ（記録済みの出力を再生します）`);
  };
  const setForSidebar=useRef(false);
  const live=useStudio(orgId,enabled&&requested,notify);
  useEffect(()=>{
    if(!enabled)return;
    const open=(event:Event)=>{
      const el=event.target instanceof Element ? event.target.closest("button") : null;
      // 審査用デモ: 手元のファイルをそのまま選べる（ブラウザから外へは送らない）。選んだあと、許諾の欄が空なら例文を入れる
      if(el?.matches(".cd-studio .cd-upload")){
        const input=el.closest(".cd-studio")?.querySelector<HTMLInputElement>("[data-source-file]");
        if(input && !input.dataset.judgeHooked){
          input.dataset.judgeHooked="1";
          input.addEventListener("change",()=>{
            window.setTimeout(()=>{
              autofillSourceMeta();
              notify(liveState()?"資料を選びました。確認にチェックして「Claudeで教材を作る」へ":"資料を選びました。デモ環境ではファイルの本文は解析せず、記録済みのClaude出力で教材を再生します。");
            },0);
          });
        }
        return;
      }
      if(!el?.closest(".cd-sidebar") || el.textContent?.trim()!=="教材スタジオ" || requested)return;
      // 2026-11: 手順 1（原資料）から始める。記録済みの下書きは「Claudeで教材を作る」を押したあとに手順 2 で開く
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
  const recordedOnly=()=>{notify("AI処理の許可と、個人情報を含まないことの確認が必要です。デモ環境では記録済みのClaude出力を使用します。");};
  if(liveMode){
    const outlines=liveOutline?.outlines??[];
    const candidates:MustCandidate[]=(liveOutline?.mustCoverCandidates??[]).map((c,i)=>({...c,id:"mc"+(i+1)}));
    const generate=async(body:Record<string,unknown>,must:Parameters<typeof draftFromGenerated>[2])=>{
      const src=liveSourceRef.current;
      if(!src){notify("原資料を選んでください");return null;}
      setLiveBusy("draft");
      try{
        const r=await liveCall<{material:GeneratedMaterial;model:string}>({mode:"generate",source:{title:src.title,text:src.text},...body,mustCover:must});
        save(visitId,draftFromGenerated(r.material,src,must));
        setLiveDraftReady(true);
        await live.openDraft(JUDGE_STUDIO_DRAFT);
        return liveJob("generate",null,JUDGE_STUDIO_DRAFT);
      }catch(e){notify(e instanceof Error?e.message:"Claude の呼び出しに失敗しました");return null;}
      finally{setLiveBusy(null);}
    };
    return {
      ...live,
      config:live.config?{...live.config,claudeConfigured:true,model:liveMode.model,demoClaude:{available:true,live:true}}:null,
      busy:liveBusy??live.busy,
      sourceId:liveSource?LIVE_SOURCE_ID:null,
      sourceInfo:liveSource?{title:liveSource.title,filename:liveSource.filename,size:liveSource.size,charCount:liveSource.charCount,warnings:[]}:null,
      outlineJob:liveOutlineJob,draftJob:liveDraftJob,outlines,candidates,
      upload:async(file,meta)=>{
        if(!meta.piiAttestedNone||!meta.perm.allowAi){notify("AI処理の許可と、個人情報を含まないことの確認が必要です");return null;}
        const read=await readSourceText(file); if(!read)return null;
        setSource({title:meta.title||file.name.replace(/\.[^.]+$/,""),text:read.text,filename:file.name,size:file.size,charCount:read.text.length});
        if(read.warnings.length)notify(read.warnings.join(" / "));
        return LIVE_SOURCE_ID;
      },
      updatePermissions:async()=>null,
      removeSource:()=>{setSource(null);setLiveOutline(null);},
      requestOutlines:async()=>{
        const src=liveSourceRef.current;
        if(!src){notify("原資料を選んでください");return null;}
        setLiveBusy("outline");
        try{
          const r=await liveCall<{outline:{outlines:Outline[];mustCoverCandidates:Omit<MustCandidate,"id">[]};model:string}>({mode:"outline",source:{title:src.title,text:src.text}});
          setLiveOutline(r.outline);
          return liveJob("outline",r.outline,null);
        }catch(e){notify(e instanceof Error?e.message:"Claude の呼び出しに失敗しました");return null;}
        finally{setLiveBusy(null);}
      },
      requestFreeform:async(brief)=>generate({brief},[]),
      // 登録→構成案→下書きを 1 回の操作で続けるので、state 反映前でも直前の構成案ジョブから案を取る
      requestDraft:async(outlineIndex,must,fromJob)=>{const o=(fromJob?.outputPayload as {outlines?:Outline[]}|null)?.outlines??outlines;return generate({outline:o[outlineIndex]??o[0]},must);},
      demoClaude:{
        enable:async()=>true,
        disable:()=>{setLiveState(null);setLiveMode(null);setLiveOutline(null);setSource(null);setLiveDraftReady(false);notify("記録済みの出力の再生に戻しました");},
        // サンプル原資料は、画面のファイル入力に実際のファイルとして入れる（本番と同じ手順: 作成元・根拠を入れて「Claudeで教材を作る」で登録→構成→下書きまで続ける）
        useSample,
      },
    };
  }
  return {
    ...live, sourceId:sourcePresent?sourceId:null,sourceInfo:sourcePresent?(chosen??fixedSource):null,busy:replayBusy??live.busy,
    config:live.config?{...live.config,demoClaude:{available:liveAvail,live:false}}:null,
    demoClaude:liveAvail?{
      enable:async(passcode:string)=>{
        try{
          const r=await fetch("/api/studio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"ping",passcode})});
          const data=(await r.json().catch(()=>({})))as{ok?:boolean;model?:string;error?:{message?:string}};
          if(!r.ok||!data.ok){notify(data.error?.message??"合言葉が違います");return false;}
          const st={passcode,model:data.model??"claude"};setLiveState(st);setLiveMode(st);
          notify(`これ以降、この端末では実際に Claude（${st.model}）で構成案と下書きを作ります`);
          return true;
        }catch{notify("サーバーに接続できませんでした");return false;}
      },
      disable:()=>{},
      useSample,
    }:{enable:async()=>{notify("この環境では実際の Claude は使えません（記録済みの出力を再生します）");return false;},disable:()=>{},useSample},
    outlineJob:requested?outlineJob:null,draftJob:requested?draftJob:null,
    outlines:requested?replay.outline.outlines as Outline[]:[],
    candidates:requested?replay.outline.mustCoverCandidates.map((c,i)=>({...c,id:"mc"+(i+1)})) as MustCandidate[]:[],
    // Arbitrary uploads and live AI are not enabled for a publicly accessible fictional exercise.
    upload:async(file,meta)=>{
      // 審査用デモ: 手元のファイルを選んで次へ進める。ファイルはブラウザの外へ送らず、本文も解析しない（Claude は呼ばない）
      if(!meta.piiAttestedNone || !meta.perm.allowAi){recordedOnly();return null;}
      if(file.size>15*1024*1024){notify("15MB 以下のファイルを選んでください");return null;}
      setChosen({title:meta.title||file.name.replace(/\.[^.]+$/,""),filename:file.name,size:file.size,charCount:fixedSource.charCount,warnings:["デモ環境: ファイルの本文は解析していません。構成案と下書きは記録済みのClaude出力を再生します。"]});
      setSourcePresent(true);return sourceId;
    },
    updatePermissions:async()=>{recordedOnly();return null;},
    removeSource:()=>{setSourcePresent(false);},
    // 登録と同じ操作で続けて呼ばれるので、state 反映前は渡された sourceId で判断する
    requestOutlines:async(sid)=>{if(!sourcePresent&&!sid)return null;setReplayBusy("outline");await pause(1400);setReplayBusy(null);return outlineJob;},
    requestFreeform:async()=>{recordedOnly();return null;},
    requestDraft:async()=>{setReplayBusy("draft");await pause(1800);const d=await live.openDraft(JUDGE_STUDIO_DRAFT);setReplayBusy(null);return d?draftJob:null;},
  };
}
