/**
 * 情緒的イラスト（例: EDI-001 ホーム挿絵）。承認済みで画像があるときだけ描画。
 * 初期配置 118×132px、幅に応じて縮小。見出しや主操作より目立たせない。
 */
export function EditorialIllustration({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`pointer-events-none select-none object-contain ${className}`}
      style={{ width: "clamp(96px, 30vw, 118px)", height: "auto", maxHeight: "132px" }}
    />
  );
}
