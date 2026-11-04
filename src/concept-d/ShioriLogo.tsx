/**
 * shiori のロゴ（採用案 A「道を描いた栞」＋ワードマーク）。患者・医療者・入口・ログインで同じ部品を使う。
 * マークは提供素材（public/brand/shiori_bookmark_A_1024.png を余白だけ詰めた shiori_mark.png）をそのまま表示し、描き直さない。
 * 色 #315E68・ワードマーク Zen Old Mincho。variant は既存の配置（患者ヘッダー .logo、医療者サイドバー .cd-logo）に合わせるためのもの。
 */
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
      {/* eslint-disable-next-line @next/next/no-img-element -- 透過 PNG をそのまま表示（最適化で色や線が変わらないように） */}
      <img className="shiori-mark" data-logo-mark src="/brand/shiori_mark.png" alt="" width={321} height={762} />
      <b aria-hidden>shiori</b>
      {sub && <small aria-hidden>{sub}</small>}
    </div>
  )
}
