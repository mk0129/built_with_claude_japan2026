"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, errorText } from "@/lib/api";

const PERMS = [
  ["allowStore", "非公開で保存してよい（必須）"],
  ["allowAi", "AI（Claude）で処理してよい"],
  ["allowDerive", "改変・要約した教材を作ってよい"],
  ["allowPublish", "患者向けに Web 公開してよい"],
  ["allowShare", "他施設と共有してよい（共通教材に必要）"],
] as const;
type PermKey = (typeof PERMS)[number][0];

export function UploadForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [rightsHolder, setRightsHolder] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [perm, setPerm] = useState<Record<PermKey, boolean>>({ allowStore: true, allowAi: false, allowDerive: false, allowPublish: false, allowShare: false });
  const [pii, setPii] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ sourceId: string; warnings: string[]; piiFlags: string[] } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setMsg("ファイルを選んでください");
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("meta", JSON.stringify({ orgId, title: title || file.name, piiAttestedNone: pii, permissions: { ...perm, rightsHolder, evidenceNote } }));
      const res = await fetch("/api/v1/studio/sources", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data.error ?? "ERROR", data.message);
      setResult(data);
      router.refresh();
    } catch (err) {
      setMsg(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-bold">
        ファイル（PDF・Word・PowerPoint、15MB まで）
        <input type="file" className="block mt-1 min-h-11" accept=".pdf,.docx,.pptx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="原資料ファイル" />
      </label>
      <label className="block text-sm font-bold">
        資料名
        <input className="input min-h-11 mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="例: ホルモン療法を続けるために" />
      </label>
      <label className="block text-sm font-bold">
        許諾元（著作権者・作成部署）
        <input className="input min-h-11 mt-1" value={rightsHolder} onChange={(e) => setRightsHolder(e.target.value)} maxLength={200} required placeholder="例: 乳腺外科（院内作成）" />
      </label>
      <label className="block text-sm font-bold">
        許諾の根拠・確認内容
        <textarea className="input mt-1" rows={2} value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} maxLength={1000} required placeholder="例: 院内作成のオリジナル資料。部長に AI 処理・改変を確認済み" />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-sm font-bold">この資料で許可されている範囲</legend>
        {PERMS.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 min-h-11 text-sm">
            <input type="checkbox" className="w-5 h-5" checked={perm[k]} disabled={k === "allowStore"} onChange={(e) => setPerm({ ...perm, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="flex items-start gap-2 text-sm rounded-xl border border-line p-3">
        <input type="checkbox" className="w-5 h-5 mt-0.5" checked={pii} onChange={(e) => setPii(e.target.checked)} />
        <span>
          <b>患者さんの個人情報（氏名・ID・生年月日・画像など）を含まないことを確認しました。</b>
          <br />
          含む資料はこの MVP では AI 処理しません。
        </span>
      </label>
      <p className="text-xs text-ink-soft">確認者（あなた）と確認日時は自動で記録されます。資料は非公開の領域に保存され、患者さんには表示されません。</p>
      <button className="btn btn-primary min-h-11 w-full" disabled={busy}>
        {busy ? "登録しています…" : "登録する"}
      </button>
      {msg && <p className="text-sm text-danger">{msg}</p>}
      {result && (
        <div className="rounded-xl border border-line p-3 text-sm space-y-1" role="status">
          <p className="font-bold">登録しました。</p>
          {result.warnings.map((w) => (
            <p key={w} className="text-[#8a5a0a]">⚠ {w}</p>
          ))}
          <a href={`/staff/studio/sources/${result.sourceId}`} className="tap-link underline">
            原資料の画面へ
          </a>
        </div>
      )}
    </form>
  );
}
