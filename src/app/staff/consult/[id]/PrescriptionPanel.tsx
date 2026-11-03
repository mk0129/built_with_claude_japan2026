"use client";
import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
import { DOMAIN_LABEL, DOMAIN_ORDER } from "@/lib/labels";
import { useMediaQuery } from "@/lib/use-media-query";
import { Icon } from "@/components/reset/Icons";

type Material = { materialId: string; versionId: string; title: string; summary: string | null; primaryDomain: string; scope: "common" | "org"; slideCount: number; questionCount: number };
type Template = { id: string; name: string; description: string | null; scope: string; materials: { id: string; title: string; primaryDomain: string }[] };
type CurrentSet = { setId: string; items: { materialId: string; title: string }[] } | null;
export type BasketItem = { materialId: string; title: string };

/**
 * 情報処方パネル。
 * - lg 以上: 右カラムに sticky。ヘッダ / スクロールする本文 / 常に見える候補・確定の 3 段
 * - lg 未満: 画面下部のドロワー。閉じていてもバーとして残り、患者情報の閲覧を妨げない
 */
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
  const isDesktop = useMediaQuery("(min-width: 1024px)");

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

  const header = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-bold" style={{ fontSize: 18, letterSpacing: "-0.05em", margin: 0 }}>
        次の情報処方
        {basket.length > 0 && <span className="rsd-tag coral ml-2">候補 {basket.length}</span>}
        {currentSet && currentSet.items.length > 0 && <span className="rsd-tag sage ml-1">処方済 {currentSet.items.length}</span>}
      </h2>
      <button className="btn" onClick={onToggle} aria-expanded={open}>
        {open ? "閉じる" : "開く"}
      </button>
    </div>
  );

  const body = (
    <div className="space-y-3">
      {currentSet && currentSet.items.length > 0 && (
        <div className="rounded-xl p-3 text-sm" style={{ background: "#e9f4ee" }}>
          <p className="font-bold">この診察で処方済み</p>
          <ul className="list-disc ml-5">
            {currentSet.items.map((i) => (
              <li key={i.materialId}>{i.title}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-1 border-b border-line">
        {(["template", "search"] as const).map((t) => (
          <button key={t} className={`px-3 min-h-11 text-sm ${tab === t ? "font-bold border-b-2 border-[color:var(--blue)] text-[color:var(--blue)]" : "text-ink-soft"}`} onClick={() => setTab(t)}>
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
                <button className="btn btn-soft text-sm min-h-11 shrink-0" onClick={() => addTemplate(t)}>
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
                  <button className="btn text-sm min-h-11 shrink-0 whitespace-nowrap" disabled={inBasket || done} onClick={() => add(m)}>
                    {done ? "処方済" : inBasket ? "追加済" : "追加"}
                  </button>
                </li>
              );
            })}
            {materials.length === 0 && <li className="text-sm text-ink-muted">該当する教材がありません</li>}
          </ul>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className="space-y-2">
      <p className="rsd-muted">必要な教材を選び、診察の最後にお渡しできます。</p>
      {basket.length === 0 ? (
        <p className="rsd-muted">「関連教材を候補へ」「再処方を候補へ」やテンプレート・検索から追加します。</p>
      ) : (
        <ul className="space-y-2 max-h-56 overflow-auto">
          {basket.map((b) => (
            <li key={b.materialId} className="rsd-small-card">
              <div className="rsd-mini-icon">
                <Icon name="book" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-snug" style={{ fontSize: 15 }}>{b.title}</div>
                <div className="rsd-muted">候補</div>
              </div>
              <button className="btn btn-ghost shrink-0" onClick={() => setBasket((x) => x.filter((y) => y.materialId !== b.materialId))} aria-label={`${b.title} を候補から外す`}>
                外す
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-primary w-full" disabled={basket.length === 0 || busy} onClick={confirm}>
        <Icon name="book" size="sm" /> 教材を処方する
      </button>
      {msg && <p className="rsd-muted" role="status">{msg}</p>}
    </div>
  );

  if (isDesktop) {
    // lg 以上: 右カラム（sticky, ヘッダ / スクロール本文 / 常に見える候補・確定）
    return (
      <aside className="rsd-card flex flex-col gap-3 sticky top-4 max-h-[calc(100vh-2rem)]" aria-label="次の情報処方">
        {header}
        {footer}
        {open && <div className="flex-1 min-h-0 overflow-auto pr-1 border-t border-line pt-3">{body}</div>}
      </aside>
    );
  }

  // lg 未満: 画面下のドロワー。閉じていてもバーとして残り、患者情報の閲覧を妨げない
  return (
    <div className={`fixed inset-x-0 bottom-0 z-20 bg-surface border-t border-line shadow-[0_-8px_24px_rgba(47,58,86,0.12)] rounded-t-2xl flex flex-col ${open ? "h-[72vh]" : ""}`} role="region" aria-label="次の情報処方">
      <div className="px-4 py-2">{header}</div>
      {open && (
        <>
          <div className="flex-1 min-h-0 overflow-auto px-4">{body}</div>
          <div className="px-4 py-3 border-t border-line bg-bg">{footer}</div>
        </>
      )}
      {!open && basket.length > 0 && (
        <div className="px-4 pb-3">
          <button className="btn btn-primary w-full" disabled={busy} onClick={confirm}>
            候補 {basket.length} 件を処方する
          </button>
        </div>
      )}
    </div>
  );
}
