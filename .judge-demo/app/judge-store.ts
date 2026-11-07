/** Each browser tab has its own synthetic patient, delivered materials and sharing window. */
export type Delivery = { materialId: string; title: string; prescribedAt: string; note: string };
export type JudgeSession = {
  id: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedBy: "clinician" | "system" | null;
  prescriptions: Delivery[];
  feedbackStatus: Record<string, "reviewed" | "resolved">;
  pendingExtension: boolean;
};

const STORAGE_KEY = "shiori:judge:visit:v1";
const listeners = new Set<() => void>();
let loaded = false;
let visit: JudgeSession | null = null;
const HOUR = 60 * 60 * 1000;
let expiryTimer: number | null = null;
function scheduleExpiry(state: JudgeSession | null) {
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  expiryTimer = null;
  if (!state || state.endedAt) return;
  expiryTimer = window.setTimeout(()=>{
    if (visit?.id === state.id && !visit.endedAt && Date.parse(visit.expiresAt) <= Date.now()) {
      save({...visit, endedAt:visit.expiresAt, endedBy:"system", pendingExtension:false});
    }
  },Math.max(0,Date.parse(state.expiresAt)-Date.now()));
}

function read(): JudgeSession | null {
  if (loaded) return visit;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as JudgeSession;
      if (typeof parsed.id === "string" && Number.isFinite(Date.parse(parsed.expiresAt)) && Array.isArray(parsed.prescriptions) && parsed.feedbackStatus) visit = parsed;
    }
  } catch { /* Private sessions that disallow storage can still use the in-memory visit. */ }
  scheduleExpiry(visit);
  return visit;
}
function save(next: JudgeSession) {
  loaded = true;
  visit = next;
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(visit)); } catch {}
  scheduleExpiry(visit);
  for (const listener of listeners) listener();
  return next;
}
export function subscribeJudgeSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getJudgeSession() { return read(); }
export function isJudgeActive(session: JudgeSession | null = read()) {
  return !!session && !session.endedAt && Date.parse(session.expiresAt) > Date.now();
}
export function startJudgeSession(): JudgeSession {
  const now = Date.now();
  return save({ id: crypto.randomUUID(), startedAt: new Date(now).toISOString(), expiresAt: new Date(now + HOUR).toISOString(), endedAt: null, endedBy:null, prescriptions: [], feedbackStatus: {}, pendingExtension:false });
}
export function endJudgeSession() {
  const current = read();
  if (current && !current.endedAt) save({...current, endedAt:new Date().toISOString(), endedBy:"clinician", pendingExtension:false});
}
export function getJudgeReceipt(): Delivery[] { return read()?.prescriptions ?? []; }
export function addDeliveries(items: {materialId:string;title:string}[], note:string) {
  const current = read();
  if (!current || !isJudgeActive(current)) throw new Error("共有は終了しました");
  const present = new Set(current.prescriptions.map(item => item.materialId));
  const prescribedAt = new Date().toISOString();
  const added = items.filter(item => !present.has(item.materialId)).map(item => ({...item,note,prescribedAt}));
  if (added.length) save({...current, prescriptions: [...current.prescriptions, ...added]});
  return added;
}
export function setFeedbackStatus(id:string, status:"reviewed"|"resolved") {
  const current=read();
  if (current && isJudgeActive(current)) save({...current,feedbackStatus:{...current.feedbackStatus,[id]:status}});
}
export function requestJudgeExtension() {
  const current=read();
  if (current && isJudgeActive(current)) save({...current,pendingExtension:true});
}
export function decideJudgeExtension(approve:boolean) {
  const current=read();
  if (current?.pendingExtension && isJudgeActive(current)) {
    save({...current, pendingExtension:false, expiresAt:approve ? new Date(Date.now()+HOUR).toISOString() : current.expiresAt});
  }
}
