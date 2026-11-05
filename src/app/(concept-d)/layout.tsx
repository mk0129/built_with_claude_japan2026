import type { Metadata, Viewport } from "next";
import "@/concept-d/figma.css";
import "@/concept-d/app.css";
import "@/concept-d/demo-patient.css";
import "@/concept-d/demo-clinician.css";

/**
 * Figma Make Concept D の移植画面（/d/*）専用のルートレイアウト。
 * 既存画面（(shiori) グループ）の globals.css（html 18px・BIZ UDPゴシック・行間 1.7 など）と混ざらないよう、ルートレイアウトごと分けている。
 * フォントは Figma と同じ Google Fonts（Noto Sans JP 400–700、Zen Old Mincho 600）を figma.css の先頭で読み込む。
 */
export const metadata: Metadata = {
  title: "shiori",
  description: "乳がんの情報処方と理解確認（ハッカソン MVP・架空データ）",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function ConceptDLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
