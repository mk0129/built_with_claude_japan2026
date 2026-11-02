/**
 * 仮イラスト（水彩ブロブ + 細い線画）。本番素材に差し替え前提。
 * name は教材スライドの imageRef。未知の名前はブロブのみ。
 */
const SHAPES: Record<string, { tone: string; path: string }> = {
  stage: { tone: "var(--sora)", path: "M12 40h40M20 32h24M28 24h8" },
  subtype: { tone: "var(--sakura)", path: "M32 16a16 16 0 1 0 0.1 0M24 32h16M32 24v16" },
  surgery: { tone: "var(--suna)", path: "M16 40c8-12 24-12 32 0M32 20v12" },
  aftercare: { tone: "var(--wakakusa)", path: "M20 44c4-10 20-10 24 0M24 20h16v12H24z" },
  drugs: { tone: "var(--sora)", path: "M22 20h20v24H22zM22 32h20" },
  selfcare: { tone: "var(--sakura)", path: "M16 36c6-14 26-14 32 0M32 18v6" },
  radiation: { tone: "var(--suna)", path: "M32 32m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M32 14v8M32 42v8M14 32h8M42 32h8" },
  mind: { tone: "var(--wakakusa)", path: "M32 44s-14-9-14-18a7 7 0 0 1 14-3a7 7 0 0 1 14 3c0 9-14 18-14 18z" },
  hospital: { tone: "var(--sora)", path: "M18 44V22h28v22M32 28v10M27 33h10" },
};

export function Illustration({ name }: { name: string | null | undefined }) {
  const s = (name && SHAPES[name]) || null;
  return (
    <div className="relative h-32 flex items-center justify-center" aria-hidden>
      <div className="absolute w-36 h-24 rounded-[45%] opacity-80" style={{ background: s?.tone ?? "var(--suna)", filter: "blur(10px)" }} />
      {s && (
        <svg viewBox="0 0 64 64" className="relative w-24 h-24" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={s.path} />
        </svg>
      )}
    </div>
  );
}
