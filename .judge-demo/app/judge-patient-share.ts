import fixture from "./fixtures/consultation.json";
import { ApiError } from "./judge-errors";
import { decideJudgeExtension, getJudgeSession, isJudgeActive, startJudgeSession } from "./judge-store";

type Party = {orgName:string;clinicianName:string};
type NativeGrant = {grantId:string;code:string;expiresAt:string;qrUrl:string;claimed:Party|null;
  decision:"pending"|"approved"|"denied"|"expired";consultationSessionId:string|null};
const grantKey="shiori:judge:native-grant:v1";
const clinician={orgName:fixture.org.orgName,clinicianName:fixture.org.displayName};
const data=(value:unknown)=>({handled:true,data:value});
const invalidGrant=()=>new ApiError(400,"GRANT_INVALID_OR_USED");

function readGrant():NativeGrant|null {
  const stored=sessionStorage.getItem(grantKey);
  if(!stored)return null;
  const grant=JSON.parse(stored) as NativeGrant;
  if(grant.decision==="pending" && Date.parse(grant.expiresAt)<=Date.now())grant.decision="expired";
  return grant;
}
function save(grant:NativeGrant){sessionStorage.setItem(grantKey,JSON.stringify(grant));}
export function getNativePatientGrant() {
  const grant=readGrant();
  return grant?.decision==="pending"?grant:null;
}

export function nativeShareApi(url:URL,method:string,body:Record<string,unknown>) {
  const path=url.pathname;
  const session=getJudgeSession();
  if(path==="/api/v1/staff/live" && method==="GET"){
    const grant=getNativePatientGrant();
    return data({activeSessionId:isJudgeActive(session)?session!.id:null,pendingGrantId:grant?.claimed?grant.grantId:null});
  }
  if(path==="/api/v1/sessions/mine" && method==="GET"){
    return data({sessions:session?[{id:session.id,active:isJudgeActive(session)}]:[]});
  }
  if(path==="/api/v1/qr" && method==="POST"){
    if(isJudgeActive(session))throw new ApiError(409,"SESSION_ALREADY_ACTIVE");
    const grantId=crypto.randomUUID();
    const code=String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000);
    const qr=new URL(window.location.origin);qr.searchParams.set("claim",grantId);qr.hash="doctor";
    const grant:NativeGrant={grantId,code,expiresAt:new Date(Date.now()+300000).toISOString(),
      qrUrl:qr.href,claimed:null,decision:"pending",consultationSessionId:null};
    save(grant);return data(grant);
  }
  if(path==="/api/v1/qr/claim" && method==="POST"){
    const grant=getNativePatientGrant();
    if(!grant || !(typeof body.code==="string" && body.code.replace(/\s/g,"")===grant.code) || body.orgId!==fixture.org.orgId || isJudgeActive(session))throw invalidGrant();
    grant.claimed=clinician;save(grant);return data({grantId:grant.grantId});
  }
  const route=path.match(/^\/api\/v1\/qr\/(claim\/)?([^/]+)(?:\/(approve|deny|cancel))?$/);
  if(route){
    const [,staff,id,action]=route;
    const grant=readGrant();if(!grant || grant.grantId!==id)throw invalidGrant();
    if(!action && method==="GET"){
      if(staff && !grant.claimed)throw invalidGrant();
      return data({decision:grant.decision,claimed:grant.claimed,consultationSessionId:grant.consultationSessionId});
    }
    if(method!=="POST")return {handled:false};
    if(grant.decision!=="pending")throw invalidGrant();
    if(action==="approve" && !staff && grant.claimed && !isJudgeActive(session)){
      grant.consultationSessionId=startJudgeSession().id;grant.decision="approved";
    }else if((action==="deny" && !staff) || (action==="cancel" && staff && grant.claimed)){
      grant.decision="denied";
    }else throw invalidGrant();
    save(grant);return data({decision:grant.decision,consultationSessionId:grant.consultationSessionId});
  }
  const extension=path.match(/^\/api\/v1\/consultations\/([^/]+)\/extend\/decide$/);
  if(extension && method==="POST"){
    if(!session || extension[1]!==session.id || !isJudgeActive(session) || !session.pendingExtension)throw new ApiError(409,"NO_PENDING_EXTENSION");
    if(typeof body.approve!=="boolean")throw new ApiError(400,"BAD_REQUEST");
    decideJudgeExtension(body.approve);return data({approved:body.approve});
  }
  return {handled:false};
}
