/**
 * shiori のロゴ（採用案 A「道を描いた栞」＋ワードマーク）。患者・医療者・入口・ログインで同じ部品を使う。
 * マークは提供素材（public/brand/shiori_bookmark_A_1024.png を余白だけ詰めた shiori_mark.png）をそのまま表示し、描き直さない。
 * 色 #315E68・ワードマーク Zen Old Mincho。variant は既存の配置（患者ヘッダー .logo、医療者サイドバー .cd-logo）に合わせるためのもの。
 * 32px 未満で表示するときは、細部を減らした小サイズ用（shiori_mark_small.svg）に切り替える（ShioriMark）。
 */

/** マークの表示の高さ（px）。32 未満は小サイズ用の簡略版、32 以上は正式マーク */
export const SMALL_MARK_MAX = 31
export function ShioriMark({ height, className }: { height: number; className?: string }) {
  const small = height <= SMALL_MARK_MAX
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 透過画像・SVG をそのまま表示（最適化で色や線が変わらないように）
    <img
      className={className}
      data-logo-mark={small ? "small" : "full"}
      src={small ? "/brand/shiori_mark_small.svg" : "/brand/shiori_mark.png"}
      alt=""
      width={small ? Math.round(height / 2) : Math.round((height * 321) / 762)}
      height={height}
    />
  )
}
export function ShioriLogo({
  variant = "patient",
  sub,
}: {
  variant?: "patient" | "clinician" | "entry"
  /** ワードマークの横の補足（医療者画面の「for medical」） */
  sub?: string
}) {
  const cls = variant === "clinician" ? "cd-logo" : variant === "entry" ? "logo shiori-logo-entry" : "logo"
  return (
    <div className={`${cls} shiori-logo`} role="img" aria-label={sub ? `shiori ${sub}` : "shiori"}>
      <ShioriMark className="shiori-mark" height={variant === "entry" ? 64 : variant === "clinician" ? 36 : 40} />
      <b aria-hidden>shiori</b>
      {sub && <small aria-hidden>{sub}</small>}
    </div>
  )
}
