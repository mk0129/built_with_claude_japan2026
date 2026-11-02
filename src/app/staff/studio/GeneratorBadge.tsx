/** 生成元の表示。実 API と擬似生成・モックを見間違えないようにする */
export function GeneratorBadge({ generator }: { generator: string }) {
  if (generator === "claude") return <span className="pill">Claude API</span>;
  if (generator === "fake") return <span className="pill border border-dashed border-danger text-danger">擬似生成（開発用）</span>;
  if (generator === "mock") return <span className="pill text-danger">テスト用モック</span>;
  return <span className="pill opacity-70">生成元不明</span>;
}
