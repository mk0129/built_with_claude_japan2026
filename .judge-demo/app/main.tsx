import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ShioriLogo } from "@/concept-d/ShioriLogo";
import { JudgeClinician } from "./JudgeClinician";
import { JudgePatient } from "./JudgePatient";
import { getJudgeReceipt, getJudgeSession, isJudgeActive, startJudgeSession, subscribeJudgeSession } from "./judge-store";
import { cancelPendingGrant, getGrantSnapshot, getNativePatientGrant, isSharePractice, setSharePractice, subscribeGrant } from "./judge-patient-share";
import replay from "./fixtures/studio-replay.json";

type View="home"|"doctor"|"patient"|"share"|"ended";
function readView():View {
  const key=location.hash.slice(1).split("?")[0];
  return ["doctor","patient","share","ended"].includes(key)?key as View:"home";
}
function go(v:View, patientPage?:string) {
  const u=new URL(location.href);
  u.search="";
  if(patientPage) u.searchParams.set("view",patientPage);
  u.hash=v==="home"?"":v;
  if(u.href!==location.href) history.pushState(null,"",u);
  dispatchEvent(new Event("judge:navigate")); window.scrollTo(0,0);
}
function useRoute(){
  const [v,setV]=useState(readView);
  useEffect(()=>{const fn=()=>setV(readView()); window.addEventListener("hashchange",fn);window.addEventListener("popstate",fn);window.addEventListener("judge:navigate",fn);return()=>{window.removeEventListener("hashchange",fn);window.removeEventListener("popstate",fn);window.removeEventListener("judge:navigate",fn);};},[]);
  return v;
}
/**
 * 医療者の画面へ。共有中なら診察サマリー、共有の操作の途中なら6桁コードの入力・承認待ち。
 * 共有がない・終了したときは診察を勝手に始めず、入口の選択（架空患者の診察／共有の操作）を出す。
 */
function openDoctor(){ go("doctor"); }
/** 入口の「医療者として体験」: このタブで一度も共有していないときだけ、架空患者の診察をすぐ始める */
function enterAsClinician(){
  if(!getJudgeSession() && !getNativePatientGrant()) startJudgeSession();
  go("doctor");
}
/** デモ用に新しい架空診察を始める（明示の操作だけ。終了した共有を延長・再開するのではなく、新しい共有にする） */
function startFictionalConsult(){
  cancelPendingGrant();
  startJudgeSession();
  go("doctor");
}
/** 共有の操作（患者がQR・6桁コードを表示 → 医師が入力 → 患者が承認）を試す */
function practiceSharing(){
  setSharePractice(true);
  go("patient","share");
}
function openPatient(){
  const session=getJudgeSession();
  go("patient",getNativePatientGrant() || session?.pendingExtension ? "share" : undefined);
}
type ActionProps={children:React.ReactNode;onClick:()=>void;secondary?:boolean}&Omit<React.ButtonHTMLAttributes<HTMLButtonElement>,"onClick"|"children">;
const Action=({children,onClick,secondary=false,...rest}:ActionProps)=>
  <button className={secondary?"j-secondary":"j-primary"} onClick={onClick} {...rest}>{children}<span aria-hidden> →</span></button>;

function Home(){
  return <main className="j-home">
    <div className="j-home-content">
      <ShioriLogo variant="entry"/>
      <h1>がんと診断されたら<span>手に取るアプリ。</span></h1>
      <div className="j-role-options">
        <button className="j-role" onClick={()=>go("patient")} aria-labelledby="patient-role" aria-describedby="patient-device">
          <span id="patient-role">患者として体験</span>
          <small id="patient-device">スマートフォン推奨</small>
        </button>
        <button className="j-role" onClick={enterAsClinician} aria-labelledby="clinician-role" aria-describedby="clinician-device">
          <span id="clinician-role">医療者として体験</span>
          <small id="clinician-device">架空患者の診察がすぐ開きます・タブレット推奨</small>
        </button>
      </div>
      <button className="j-home-share" onClick={practiceSharing} data-practice-share>
        共有の操作（QR・6桁コード）をこの端末で試す
      </button>
    </div>
  </main>;
}

/** 医療者の入口: 共有がない・終了したときに、今できることを区別して示す */
function DoctorEntry({ended}:{ended:boolean}){
 const receipt=ended?getJudgeReceipt():[];
 return <main className="j-panel j-entry" data-doctor-entry={ended?"ended":"none"}>
  <p className="j-eyebrow">{ended?"共有終了":"医療者の画面"}</p>
  <h1>{ended?"一時共有は終了しました。":"どちらを試しますか。"}</h1>
  <p>{ended
    ?"医師はこの共有の患者記録を開けません。終了した共有は延長・再開されません。続けて試すときは、下のどちらかを選んでください。"
    :"このタブでは、まだ患者との共有がありません。架空患者の診察をすぐ試すか、実際と同じ共有の手順を試すかを選んでください。"}</p>
  <div className="j-entry-options">
   <section className="j-consent-card">
    <h2>架空患者の診察を試す</h2>
    <p>すぐ診察サマリーへ進みます。審査用に、架空患者「佐藤 花子」さんとの60分の共有を新しく始めます。</p>
    <Action onClick={startFictionalConsult} data-start-fictional>{ended?"新しい架空診察を始める（デモ用）":"架空患者の診察を始める"}</Action>
   </section>
   <section className="j-consent-card">
    <h2>共有の操作を試す（QR・6桁コード）</h2>
    <p>患者側でQRと6桁コードを表示 → 医師側でコードを入力 → 患者側で承認、の順に、実際の手順をこの端末で試します。</p>
    <Action secondary onClick={practiceSharing} data-practice-share>患者側でコードを表示する</Action>
   </section>
  </div>
  {receipt.length>0&&<div className="j-consent-card"><h2>今回届けた教材</h2><ul>{receipt.map(x=><li key={x.materialId}>{x.title}</li>)}</ul></div>}
  <div className="j-end-buttons">{ended&&<Action secondary onClick={()=>go("patient")}>患者の画面を見る</Action>}<Action secondary onClick={()=>go("home")}>入口へ戻る</Action></div>
 </main>;
}
function Help(){
 return <details className="j-help"><summary>操作ガイド</summary><div><b>おすすめの3ステップ</b><ol><li>診察サマリーの「患者の質問」から「根拠 1件」を押します。</li><li>「在宅経過表」で、表の10月28日・手足のしびれのセルを開きます。</li><li>「教材ライブラリ」から教材を選び、確認して確定します。上部の「患者側」で受け取れます。</li></ol><p>教材スタジオでは、サンプルの架空資料から、記録済みのClaude出力を再生して下書きを編集・プレビューできます。</p><p>共有の操作（QR・6桁コード）を試すときは、左下の「共有を終了」の後に出る選択から始めます。</p></div></details>;
}
type GrantView={grantId:string;code:string;claimed:unknown;decision:string;consultationSessionId:string|null};
function useGrant():GrantView|null{
  const raw=useSyncExternalStore(subscribeGrant,getGrantSnapshot);
  return raw?JSON.parse(raw) as GrantView:null;
}
function onDomChange(listener:()=>void){
  const mo=new MutationObserver(listener);
  mo.observe(document.body,{childList:true,subtree:true});
  return ()=>mo.disconnect();
}
const studioShown=()=>!!document.querySelector(".cd-studio");
const replayLabel=replay.model+"・"+replay.generatedOn+" の記録";

/** デモの外枠の案内: 今の状態で、次に何をすればよいか */
function Guide({view}:{view:View}){
  const s=useSyncExternalStore(subscribeJudgeSession,getJudgeSession);
  const grant=useGrant();
  const practice=useSyncExternalStore(subscribeGrant,isSharePractice);
  const studio=useSyncExternalStore(onDomChange,studioShown);
  const active=isJudgeActive(s);
  const pending=grant?.decision==="pending"?grant:null;
  const code=pending?.code?pending.code.slice(0,3)+" "+pending.code.slice(3):"";
  const sharedByGrant=active && grant?.decision==="approved" && grant.consultationSessionId===s?.id;
  let body:React.ReactNode=null;
  if(view==="doctor"){
    if(pending && !pending.claimed) body=<><b>共有の操作 ②</b><span>患者側に表示された6桁コード <strong className="j-guide-code" data-guide-code>{code}</strong> を入力して申請します（端末一台で両方の役を試すため、ここにも表示しています）。</span><button onClick={startFictionalConsult}>コードを取り消して架空患者の診察へ</button></>;
    else if(pending) body=<><b>共有の操作 ③</b><span>患者側で、申請した医療者を確認して承認してください。</span><button onClick={openPatient}>患者側で承認する →</button></>;
    else if(active && studio) body=<><b>教材スタジオ（審査用）</b><span data-guide-studio>サンプルの架空資料を使い、構成案と下書きは記録済みのClaude出力（{replayLabel}）を再生します。今回Claudeは呼び出していません。</span></>;
    else if(active && sharedByGrant) body=<><b>共有の操作 ④</b><span>患者の承認で共有が始まりました。終了すると再開されず、次は新しい共有が必要です。</span></>;
    else if(active) body=<><b>架空患者の診察中</b><span>審査用に共有を始めた架空患者です。共有の操作を試すときは、左下の「共有を終了」から選べます。</span></>;
  }else if(view==="patient"){
    if(pending && !pending.claimed) body=<><b>共有の操作 ②</b><span>「医師側」に切り替え、この6桁コードを入力します。</span><button onClick={openDoctor}>医師側でコードを入力 →</button></>;
    else if(pending) body=<><b>共有の操作 ③</b><span>医療者から共有の申請が届きました。共有先を確認して承認してください。</span></>;
    else if(practice && sharedByGrant) body=<><b>共有の操作 ④</b><span>共有が始まりました。「医師側」で診察サマリーを開けます。</span><button onClick={openDoctor}>医師側へ →</button></>;
    else if(practice && active) body=<><b>共有の操作</b><span>今は共有中です。「一時共有を終了する」を押してから、コードを表示します。</span></>;
    else if(practice) body=<><b>共有の操作 ①</b><span>共有の画面で「QRコードと6桁コードを表示する」を押します。</span></>;
  }
  const ref=useRef<HTMLDivElement>(null);
  const shown=!!body;
  useLayoutEffect(()=>{
    const screen=document.querySelector<HTMLElement>(".j-screen");
    const el=ref.current;
    if(!screen)return;
    if(!el){screen.style.setProperty("--j-guide","0px");return;}
    const set=()=>screen.style.setProperty("--j-guide",el.offsetHeight+"px");
    set();
    const ro=new ResizeObserver(set);ro.observe(el);
    return ()=>{ro.disconnect();screen.style.setProperty("--j-guide","0px");};
  },[shown,view]);
  if(!body)return null;
  return <div className="j-guide" ref={ref} role="status" data-judge-guide>{body}</div>;
}
function App(){
 const v=useRoute();const s=useSyncExternalStore(subscribeJudgeSession,getJudgeSession);
 const grant=useGrant();
 const onEnd=useCallback(()=>go("ended"),[]);
 useEffect(()=>{document.title=({home:"shiori｜がんと診断されたら手に取るアプリ",doctor:"診察サマリー｜shiori",patient:"患者の画面｜shiori",share:"一時共有｜shiori",ended:"共有終了｜shiori"})[v];},[v]);
 useEffect(()=>{if(v==="share")go("patient","share");},[v]);
 if(v==="home")return <Home/>;
 const claimLink=new URLSearchParams(location.search).has("claim");
 const doctorReady=isJudgeActive(s)||grant?.decision==="pending"||claimLink;
 return <div className={'j-screen j-view-'+v}><nav className="j-toolbar" aria-label="審査デモ"><button onClick={()=>go("home")} className="j-brand-button">shiori <span>デモ入口</span></button><div>
 {v==="doctor"&&<><Help/><button onClick={openPatient}>患者側</button></>}
 {v==="patient"&&<button onClick={openDoctor}>医師側</button>}
 </div></nav>
 <Guide view={v}/>
 {v==="doctor"&&(doctorReady?<JudgeClinician key={s?.id??"request"} onEnd={onEnd}/>:<DoctorEntry ended={!!s}/>)}
 {v==="patient"&&<JudgePatient/>}
 {v==="ended"&&<DoctorEntry ended/>}</div>;
}
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}> {
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<main className="j-panel"><h1>画面を開けませんでした。</h1><p>デモ入口からもう一度お試しください。</p><a href="/">入口へ戻る</a></main>:this.props.children;}
}
createRoot(document.getElementById("root")!).render(<Boundary><App/></Boundary>);
