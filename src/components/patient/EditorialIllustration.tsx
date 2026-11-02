/**
 * 情緒的イラスト（例: EDI-001 ホーム挿絵）。公開可（approved）で画像があるときだけ描画。
 * 医学的図解の監修とは別扱い（権利・公開可否の確認のみ）。
 * 幅は 390px で約 150px、430px 以上で 160px（clamp）。アスペクト比は原画のまま。見出しや主操作より目立たせない。
 */
export function EditorialIllustration({ src, alt, className = "", size = "default" }: { src: string | null; alt: string; className?: string; size?: "default" | "compact" }) {
  if (!src) return null;
  const width = size === "compact" ? "clamp(96px, 30vw, 118px)" : "clamp(118px, 38vw, 160px)";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={`edi-illustration pointer-events-none select-none object-contain ${className}`} style={{ width, height: "auto" }} />
  );
}
