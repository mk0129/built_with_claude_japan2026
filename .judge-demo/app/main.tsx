import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ShioriLogo } from "@/concept-d/ShioriLogo";
import { JudgeClinician } from "./JudgeClinician";
import { JudgePatient } from "./JudgePatient";
import { getJudgeReceipt, getJudgeSession, isJudgeActive, subscribeJudgeSession } from "./judge-store";

import { getNativePatientGrant } from "./judge-patient-api";

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
// 2026-11: 最初は共有前の状態から。患者側で発行した共有コードで始めるのが本来の流れで、医師側の画面にデモ用の開始ボタンも置く
function openConsult(){
  go("doctor");
}
function openPatient(){
  const session=getJudgeSession();
  go("patient",getNativePatientGrant() || session?.pendingExtension ? "share" : undefined);
}
const Action=({children,onClick,secondary=false}:{children:React.ReactNode;onClick:()=>void;secondary?:boolean})=>
  <button className={secondary?"j-secondary":"j-primary"} onClick={onClick}>{children}<span aria-hidden> →</span></button>;

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
        <button className="j-role" onClick={openConsult} aria-labelledby="clinician-role" aria-describedby="clinician-device">
          <span id="clinician-role">医療者として体験</span>
          <small id="clinician-device">タブレット推奨 · 最初は共有前。患者の共有コードか、画面のデモ用ボタンで始めます</small>
        </button>
      </div>
      <p className="j-home-note">どちらから始めても大丈夫です。上部の「患者側」「医師側」でいつでも切り替えられます。扱うデータはすべて架空です。</p>
      <p className="j-home-note"><button type="button" className="j-reset" onClick={()=>{try{sessionStorage.clear();}catch{} location.replace(location.pathname);}}>最初からやり直す</button>（この端末で進めた共有・記録・教材を消して、共有していない状態に戻します）</p>
    </div>
  </main>;
}
function Ended(){
 const receipt=getJudgeReceipt();
 return <main className="j-panel"><p className="j-eyebrow">診察終了</p><h1>一時共有は終了しました。</h1><p>医師はこの診察の患者記録を開けなくなりました。届けた教材は患者側で確認できます。</p>
 {receipt.length>0&&<div className="j-consent-card"><h2>今回届けた教材</h2><ul>{receipt.map(x=><li key={x.materialId}>{x.title}</li>)}</ul></div>}
 <div className="j-end-buttons"><Action onClick={()=>go("patient")}>患者の画面を見る</Action><Action secondary onClick={()=>go("home")}>入口へ戻る</Action></div></main>;
}
function Help(){
 return <details className="j-help"><summary>操作ガイド</summary><div><b>おすすめの3ステップ</b><ol><li>診察サマリーの上部で、在宅での症状・バイタル（S・O）と患者の質問を確認します。右の「理解確認の正答率」を押すと内訳が開きます。</li><li>「AI 情報処方リコメンド」の候補を「候補に追加」し、「選択中 N件を確認」から処方を確定します。上部の「患者側」で、届いた教材をすぐ確認できます。</li><li>「在宅経過」で、バイタルの色分けと症状推移（すべての症状を重ねる）を見ます。</li></ol><p>教材スタジオでは、手元の PDF を選んで手順を進められます（デモ環境では記録済みの Claude 出力を再生します）。</p></div></details>;
}
function App(){
 const v=useRoute();const s=useSyncExternalStore(subscribeJudgeSession,getJudgeSession);
 const onEnd=useCallback(()=>go("ended"),[]);
 useEffect(()=>{document.title=({home:"shiori｜がんと診断されたら手に取るアプリ",doctor:"診察サマリー｜shiori",patient:"患者の画面｜shiori",share:"一時共有｜shiori",ended:"共有終了｜shiori"})[v];},[v]);
 useEffect(()=>{if(v==="share")go("patient","share");},[v]);
 if(v==="home")return <Home/>;
 return <div className={'j-screen j-view-'+v}><nav className="j-toolbar" aria-label="審査デモ"><button onClick={()=>go("home")} className="j-brand-button">shiori <span>デモ入口</span></button><div>
 {v==="doctor"&&<><Help/><button onClick={openPatient}>患者側</button></>}
 {v==="patient"&&<button onClick={()=>openConsult()}>医師側</button>}
 </div></nav>
 {v==="doctor"&&(!s||isJudgeActive(s)||getNativePatientGrant()?<JudgeClinician key={s?.id??"request"} onEnd={onEnd}/>:<Ended/>)}
 {v==="patient"&&<JudgePatient/>}
 {v==="ended"&&<Ended/>}</div>;
}
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}> {
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<main className="j-panel"><h1>画面を開けませんでした。</h1><p>デモ入口からもう一度お試しください。</p><button type="button" className="j-secondary" onClick={()=>location.assign("/")}>入口へ戻る</button></main>:this.props.children;}
}
createRoot(document.getElementById("root")!).render(<Boundary><App/></Boundary>);
