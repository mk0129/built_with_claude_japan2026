/**
 * 開発専用の擬似生成（CLAUDE_FAKE=1 かつ NODE_ENV !== "production" のときだけ有効）。
 * API キーなしで画面の通し確認（E2E）をするためのもの。原資料の文をそのまま並べるだけで、
 * 医学的な要約は行わない。モデル名は "fake:" で始まり、下書きの変更履歴にも擬似生成と記録される。
 * 実際の Claude API による生成の検証には使わない。
 */
export function fakeEnabled() {
  return process.env.CLAUDE_FAKE === "1" && process.env.NODE_ENV !== "production";
}

export function fakeGenerate(user: string, schemaName: string): unknown {
  const m = user.match(/<source id="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/source>/);
  const sid = m?.[1] ?? "";
  const sentences = (m?.[2] ?? "")
    .split(/(?<=。)|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 80);
  const pick = (i: number) => sentences[i % Math.max(1, sentences.length)] ?? "（原資料の文）";
  const ref = (i: number) => [{ sourceId: sid, section: "", quote: pick(i) }];
  if (schemaName === "outline") {
    return {
      outlines: [
        { title: "【擬似生成】原資料の要点", primaryDomain: "drug_therapy", targetReader: "（開発用）", learningObjectives: ["原資料の要点を知る"], slideTitles: ["要点 1", "要点 2", "まとめ"], rationale: "開発用の擬似生成です。", sourceRefs: ref(0) },
      ],
      notCoveredBySource: [],
    };
  }
  return {
    title: "【擬似生成】原資料の要点",
    summary: "開発用の擬似生成です（Claude ではありません）。",
    primaryDomain: "drug_therapy",
    learningObjectives: ["原資料の要点を知る"],
    slides: [0, 1, 2].map((i) => ({ title: `要点 ${i + 1}`, proposition: pick(i), body: pick(i + 3), detail: "", sourceRefs: ref(i) })),
    questions: [0, 1].map((i) => ({ stem: `【擬似】次のうち原資料にある文は？（${i + 1}）`, options: [pick(i), "原資料にない文 A", "原資料にない文 B"], correctIndex: 0, explanation: "開発用の擬似問題です。", relatedSlide: i + 1, sourceRefs: ref(i) })),
    notCoveredBySource: [],
  };
}
