import JSZip from "jszip";

export const ACCEPTED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/markdown": "md",
};

export type Extraction = {
  text: string;
  textSource: "extracted" | "none";
  warnings: string[];
  meta: { pages?: number; lowTextPages?: number[]; imageCount?: number; charCount: number };
};

/** 拡張子と MIME から種類を決める（ブラウザが MIME を空で送る場合に備える） */
export function detectKind(filename: string, mime: string): string | null {
  if (ACCEPTED_MIME[mime]) return ACCEPTED_MIME[mime];
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return ["pdf", "docx", "pptx", "txt", "md"].includes(ext) ? ext : null;
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/**
 * テキスト抽出。画像解析（OCR）は行わない（D30）。図表・画像が多い／文字が少ない場合は警告を返す。
 */
export async function extractText(buf: Buffer, kind: string): Promise<Extraction> {
  const warnings: string[] = [];
  let text = "";
  const meta: Extraction["meta"] = { charCount: 0 };

  if (kind === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text: pages } = await pdfText(pdf, { mergePages: false });
    const arr = Array.isArray(pages) ? pages : [pages];
    meta.pages = totalPages;
    meta.lowTextPages = arr.map((t, i) => (t.replace(/\s/g, "").length < 40 ? i + 1 : 0)).filter(Boolean);
    text = arr.map((t, i) => `[p.${i + 1}]\n${t.trim()}`).join("\n\n");
    if (meta.lowTextPages.length) warnings.push(`文字がほとんど取り出せないページがあります（${meta.lowTextPages.join(", ")} ページ）。画像やスキャンの内容は読み取っていません。`);
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: buf });
    text = r.value;
    const zip = await JSZip.loadAsync(buf);
    meta.imageCount = Object.keys(zip.files).filter((f) => f.startsWith("word/media/")).length;
  } else if (kind === "pptx") {
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const parts: string[] = [];
    const low: number[] = [];
    for (const [i, f] of slides.entries()) {
      const xml = await zip.files[f].async("string");
      const t = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(" ");
      if (t.replace(/\s/g, "").length < 20) low.push(i + 1);
      parts.push(`[スライド ${i + 1}]\n${t.trim()}`);
    }
    text = parts.join("\n\n");
    meta.pages = slides.length;
    meta.lowTextPages = low;
    meta.imageCount = Object.keys(zip.files).filter((f) => f.startsWith("ppt/media/")).length;
    if (low.length) warnings.push(`文字が少ないスライドがあります（${low.join(", ")}）。図や画像の内容は読み取っていません。`);
  } else {
    text = buf.toString("utf8");
  }

  if (meta.imageCount && meta.imageCount > 0) {
    warnings.push(`画像・図表が ${meta.imageCount} 点含まれています。画像の内容は教材生成に使われません。必要な情報は本文として確認してください。`);
  }
  meta.charCount = text.replace(/\s/g, "").length;
  if (meta.charCount < 200) warnings.push("取り出せた文字が少なすぎます（200 文字未満）。教材生成には十分な本文が必要です。");
  return { text, textSource: meta.charCount > 0 ? "extracted" : "none", warnings, meta };
}

/**
 * 患者個人情報らしき記載の簡易検出（MVP では該当資料を AI 処理しない）。
 * 誤検出はありうるが、検出したら人が確認するまで止める方針。
 */
export function detectPii(text: string): string[] {
  const rules: [RegExp, string][] = [
    [/(患者\s*(ID|番号)|カルテ\s*(番号|No)|診察券\s*番号)\s*[:：]?\s*[A-Za-z0-9-]{3,}/, "患者 ID・カルテ番号らしき記載"],
    [/生年月日\s*[:：]?\s*(\d{4}|[明大昭平令]\S{0,2}\d)/, "生年月日らしき記載"],
    [/(氏名|患者名)\s*[:：]\s*\S{2,}/, "氏名欄らしき記載"],
    [/\b0\d{1,4}-\d{1,4}-\d{3,4}\b/, "電話番号らしき記載"],
    [/〒?\s*\d{3}-\d{4}/, "郵便番号らしき記載"],
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "メールアドレスらしき記載"],
  ];
  return rules.filter(([re]) => re.test(text)).map(([, label]) => label);
}
