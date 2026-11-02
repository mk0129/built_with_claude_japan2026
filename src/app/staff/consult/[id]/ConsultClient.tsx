"use client";
import { useState } from "react";
import { useNow } from "@/lib/use-now";
import Link from "next/link";
import { ApiError, api, errorText } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";

type Consultation = {
  id: string;
  orgName: string;
  clinicianName: string;
  startedAt: string;
  expiresAt: string;
  active: boolean;
  endedBy: string | null;
  pendingExtension: { id: string } | null;
};
type Summary = {
  patient: { id: string; displayName: string };
  consultationCount: number;
  previousConsultations: { id: string; orgName: string; startedAt: string }[];
  unreadQuestions: unknown[];
  wrongAnswers: unknown[];
  incompleteMaterials: unknown[];
};

function fmtRemain(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function ConsultClient({ sessionId }: { sessionId: string }) {
  const now = useNow();
  const [err, setErr] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const consult = usePoll<Consultation>(() => api(`/api/v1/consultations/${sessionId}`), 10_000, [sessionId]);
  const active = consult.data?.active ?? true;
  const summary = usePoll<Summary>(active ? () => api(`/api/v1/consultations/${sessionId}/patient`) : null, 15_000, [sessionId, active]);

  const denied = summary.error instanceof ApiError && (summary.error.status === 403 || summary.error.status === 401);
  const ended = consult.data ? !consult.data.active : denied;

  if (ended) {
    return (
      <main className="max-w-xl mx-auto card space-y-3">
        <h1 className="text-xl font-bold">診察セッションは終了しました</h1>
        <p className="text-ink-soft">
          {consult.data?.endedBy === "patient" ? "患者さんが共有を終了しました。" : consult.data?.endedBy === "clinician" ? "終了操作が行われました。" : "60 分が経過したか、共有が停止されました。"}
          患者さんの情報はこれ以上表示されません。
        </p>
        <Link href="/staff/scan" className="btn btn-primary btn-block">
          新しい QR を読み取る
        </Link>
      </main>
    );
  }

  const c = consult.data;
  const s = summary.data;
  const remainMs = c ? new Date(c.expiresAt).getTime() - now : 0;

  async function end() {
    try {
      await api(`/api/v1/consultations/${sessionId}/end`, { json: {} });
      consult.setData(c ? { ...c, active: false, endedBy: "clinician" } : null);
    } catch (e) {
      setErr(errorText(e));
    }
  }
  async function extend() {
    try {
      await api(`/api/v1/consultations/${sessionId}/extend`, { json: {} });
      setErr("延長を要求しました。患者さんの画面で承認されると残り時間が更新されます。");
    } catch (e) {
      setErr(errorText(e));
    }
  }

  return (
    <main className="space-y-4">
      <header className="card flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-sm text-ink-soft">{c?.orgName} ・ {c?.clinicianName}</p>
          <h1 className="text-xl font-bold">{s ? `${s.patient.displayName} さん` : "読み込み中…"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`pill ${remainMs < 5 * 60_000 ? "bg-sakura" : "bg-wakakusa"}`} aria-live="polite">
            残り {c ? fmtRemain(remainMs) : "--:--"}
          </span>
          {c?.pendingExtension ? <span className="pill">延長の承認待ち</span> : (
            <button className="btn text-sm" onClick={extend}>
              延長を要求
            </button>
          )}
          <button className="btn btn-danger text-sm" onClick={end}>
            終了
          </button>
        </div>
      </header>
      {err && <p className="text-sm text-ink-soft">{err}</p>}

      <div className="grid lg:grid-cols-[1fr_minmax(280px,360px)] gap-4">
        <section className="space-y-4">
          <PriorityCard title="未確認の質問" items={s?.unreadQuestions ?? []} empty="未確認の質問はありません" tone="sakura" />
          <PriorityCard title="誤答・わからない" items={s?.wrongAnswers ?? []} empty="確認が必要な誤答はありません" tone="suna" />
          <PriorityCard title="未完了の教材" items={s?.incompleteMaterials ?? []} empty="未完了の教材はありません" tone="sora" />
          <section className="card space-y-2">
            <h2 className="font-bold">スコア・前回のスナップショット</h2>
            <p className="text-sm text-ink-soft">Day 2 で全体 / 前回宿題 / 領域別スコアと、診察開始時点のスナップショットを表示します。</p>
          </section>
          {s && s.previousConsultations.length > 0 && (
            <section className="card space-y-2">
              <h2 className="font-bold">これまでの診察セッション</h2>
              <ul className="text-sm space-y-1">
                {s.previousConsultations.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.orgName}</span>
                    <span className="text-ink-muted">{new Date(p.startedAt).toLocaleString("ja-JP")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <aside className={`card space-y-3 ${panelOpen ? "" : "lg:sticky lg:top-4"}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">情報処方</h2>
            <button className="btn btn-ghost text-sm" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen}>
              {panelOpen ? "閉じる" : "開く"}
            </button>
          </div>
          {panelOpen ? (
            <p className="text-sm text-ink-soft">テンプレート / キーワード検索 / 候補バスケット / 処方の確定（Day 2 で実装）</p>
          ) : (
            <p className="text-sm text-ink-muted">教材を選んで宿題セットにまとめます。</p>
          )}
        </aside>
      </div>
    </main>
  );
}

function PriorityCard({ title, items, empty, tone }: { title: string; items: unknown[]; empty: string; tone: "sakura" | "suna" | "sora" }) {
  const bg = tone === "sakura" ? "bg-sakura" : tone === "suna" ? "bg-suna" : "bg-sora";
  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        <span className={`pill ${bg}`}>{items.length} 件</span>
      </div>
      {items.length === 0 ? <p className="text-sm text-ink-soft">{empty}</p> : null}
    </section>
  );
}
