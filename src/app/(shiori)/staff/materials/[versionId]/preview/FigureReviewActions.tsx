"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/api";

export function FigureReviewActions({ assetId, status, hasFile }: { assetId: string; status: string; hasFile: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function set(next: "approved" | "rejected" | "pending_review") {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/v1/admin/figures/${assetId}/review`, { json: { status: next, note: note || null } });
      router.refresh();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
      <p className="text-sm font-bold">監修の記録（{assetId}）</p>
      <input className="input min-h-11" placeholder="監修メモ（任意）" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="監修メモ" />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn min-h-11 text-sm" disabled={busy || status === "rejected"} onClick={() => set("rejected")}>
          差し戻す
        </button>
        <button className="btn btn-primary min-h-11 text-sm" disabled={busy || status === "approved" || !hasFile} onClick={() => set("approved")} title={hasFile ? "" : "画像が未納品のため承認できません"}>
          監修済みにする
        </button>
      </div>
      {!hasFile && <p className="text-xs text-ink-soft">画像ファイルが未納品のため「監修済み」にはできません。</p>}
      {status === "approved" && (
        <button className="btn btn-ghost min-h-11 text-sm" disabled={busy} onClick={() => set("pending_review")}>
          監修待ちに戻す
        </button>
      )}
      {msg && <p className="text-sm text-danger">{msg}</p>}
    </div>
  );
}
