"use client";
import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
import { DOMAIN_LABEL, DOMAIN_ORDER } from "@/lib/labels";

type Material = { materialId: string; versionId: string; title: string; summary: string | null; primaryDomain: string; scope: "common" | "org"; slideCount: number; questionCount: number };
type Template = { id: string; name: string; description: string | null; scope: string; materials: { id: string; title: string; primaryDomain: string }[] };
type CurrentSet = { setId: string; items: { materialId: string; title: string }[] } | null;

export type BasketItem = { materialId: string; title: string };

export function PrescriptionPanel({
  sessionId,
  open,
  onToggle,
  currentSet,
  onPrescribed,
  basket,
  setBasket,
}: {
  sessionId: string;
  open: boolean;
  onToggle: () => void;
  currentSet: CurrentSet;
  onPrescribed: () => void;
  basket: BasketItem[];
  setBasket: (updater: (b: BasketItem[]) => BasketItem[]) => void;
}) {
  const [tab, setTab] = useState<"template" | "search">("template");
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ templates: Template[] }>(`/api/v1/consultations/${sessionId}/templates`).then((r) => setTemplates(r.templates)).catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (domain) params.set("domain", domain);
    const t = setTimeout(() => {
      api<{ items: Material[] }>(`/api/v1/consultations/${sessionId}/materials?${params}`).then((r) => setMaterials(r.items)).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [sessionId, q, domain]);

  const alreadyIds = new Set(currentSet?.items.map((i) => i.materialId) ?? []);
  function add(m: BasketItem) {
    setBasket((b) => (b.some((x) => x.materialId === m.materialId) ? b : [...b, { materialId: m.materialId, title: m.title }]));
  }
  function addTemplate(t: Template) {
    const found = t.materials.map((tm) => ({ materialId: tm.id, title: tm.title }));
    setBasket((b) => [...b, ...found.filter((f) => !b.some((x) => x.materialId === f.materialId))]);
    setMsg(`「${t.name}」の ${found.length} 教材を候補に追加しました`);
  }
  async function confirm() {
    if (basket.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/v1/consultations/${sessionId}/prescriptions`, { json: { materialIds: basket.map((b) => b.materialId) } });
      setMsg(`${basket.length} 件を処方しました。患者さんのホームに届いています。`);
      setBasket(() => []);
      onPrescribed();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="card space-y-3 lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] overflow-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">情報処方</h2>
        <button className="btn btn-ghost text-sm" onClick={onToggle} aria-expanded={open}>
          {open ? "閉じる" : "開く"}
        </button>
      </div>

      {currentSet && currentSet.items.length > 0 && (
        <div className="rounded-xl bg-wakakusa p-3 text-sm">
          <p className="font-bold">この診察で処方済み（{currentSet.items.length}）</p>
          <ul className="list-disc ml-5">
            {currentSet.items.map((i) => (
              <li key={i.materialId}>{i.title}</li>
            ))}
          </ul>
        </div>
      )}

      {open && (
        <>
          <div className="flex gap-1 border-b border-line">
            {(["template", "search"] as const).map((t) => (
              <button key={t} className={`px-3 py-2 text-sm ${tab === t ? "font-bold border-b-2 border-accent" : "text-ink-soft"}`} onClick={() => setTab(t)}>
                {t === "template" ? "テンプレート" : "検索"}
              </button>
            ))}
          </div>

          {tab === "template" ? (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li key={t.id} className="rounded-xl border border-line p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{t.name}</p>
                    <button className="btn btn-soft text-sm min-h-10" onClick={() => addTemplate(t)}>
                      まとめて追加
                    </button>
                  </div>
                  <p className="text-xs text-ink-muted">{t.description}</p>
                  <ul className="text-sm text-ink-soft list-disc ml-5">
                    {t.materials.map((m) => (
                      <li key={m.id}>{m.title}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2">
              <input className="input" placeholder="キーワード（例: 副作用）" value={q} onChange={(e) => setQ(e.target.value)} aria-label="キーワード検索" />
              <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="領域">
                <option value="">すべての領域</option>
                {DOMAIN_ORDER.map((d) => (
                  <option key={d} value={d}>{DOMAIN_LABEL[d]}</option>
                ))}
              </select>
              <p className="text-xs text-ink-muted">AI 検索（患者情報を送らない自然言語検索）は後続フェーズで追加します。</p>
              <ul className="space-y-2">
                {materials.map((m) => {
                  const inBasket = basket.some((b) => b.materialId === m.materialId);
                  const done = alreadyIds.has(m.materialId);
                  return (
                    <li key={m.materialId} className="rounded-xl border border-line p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold leading-snug">{m.title}</p>
                        <p className="text-xs text-ink-muted">
                          {DOMAIN_LABEL[m.primaryDomain]} ・ {m.slideCount}画面 ・ {m.questionCount}問{m.scope === "org" ? " ・ 当院" : ""}
                        </p>
                        {m.summary && <p className="text-sm text-ink-soft">{m.summary}</p>}
                      </div>
                      <button className="btn text-sm min-h-10 shrink-0" disabled={inBasket || done} onClick={() => add(m)}>
                        {done ? "処方済" : inBasket ? "追加済" : "追加"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border-2 border-sakura-deep p-3 space-y-2">
        <p className="font-bold">候補（{basket.length}）</p>
        {basket.length === 0 ? (
          <p className="text-sm text-ink-muted">ダッシュボードの「関連教材を処方」や検索から追加します。</p>
        ) : (
          <ul className="space-y-1">
            {basket.map((b) => (
              <li key={b.materialId} className="flex items-center justify-between gap-2 text-sm">
                <span>{b.title}</span>
                <button className="btn btn-ghost text-xs min-h-8" onClick={() => setBasket((x) => x.filter((y) => y.materialId !== b.materialId))} aria-label={`${b.title} を候補から外す`}>
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="btn btn-primary btn-block" disabled={basket.length === 0 || busy} onClick={confirm}>
          処方を確定する
        </button>
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      </div>
    </aside>
  );
}
