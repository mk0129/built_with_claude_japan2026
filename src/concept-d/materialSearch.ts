/**
 * 患者の「教材を探す」の検索（クライアント側で動く純粋関数。DB・サーバーに依存しない）。
 *
 * - 対象: 題名・学習領域・概要・目標（従来の検索対象）＋スライドの見出し・要点・本文・補足。
 * - 結果: 教材ごとに、該当したスライド（番号・見出し）とスニペットを返す。
 * - 表記ゆれ: 全角/半角（NFKC）、カタカナ/ひらがな、英字の大小、空白の有無だけをそろえる（同義語の展開はしない）。
 * - 入力は「その患者が閲覧できる承認済み教材」（/api/v1/library が返した一覧）である前提。
 *   さらに防御として、状態が分かる教材は関数内でも除外する（{@link isSearchableMaterial}）。
 *   判定はサーバーの assertPatientHasVersion（src/server/services/learning.ts）と同じ条件:
 *   処方された版は閲覧可、それ以外は公開中（published）かつ現行版だけ。閲覧不可と明示された教材は除外。
 *
 * 審査用公開デモ（.judge-demo）は PatientD.tsx をそのままバンドルするため、この関数は fetch もしない。
 * スライドの取得は呼び出し側（例: ./materialSearchSlides.ts の useMaterialSearchSlides）で行う。
 */

/** 教材の版の状態（DB の material_version_status と同じ値） */
export type SearchMaterialStatus = "draft" | "in_review" | "published" | "retired";

/** 検索対象の教材（DLesson / LiveLesson をそのまま渡せる形） */
export type SearchableMaterial = {
  id: string | number;
  title: string;
  /** 学習領域（表示名） */
  category?: string | null;
  summary?: string | null;
  /** この教材で確認すること（学習目標） */
  goal?: string | null;
  /** スライドを引く鍵（なければ id） */
  versionId?: string | null;
  /** 処方された教材（旧版でも閲覧可） */
  prescribed?: boolean;
  /**
   * 版の承認状態。分かる場合だけ渡す（未承認・取り下げ版を除外する防御）。
   * 学習状態の status（new / doing / done）とは別の項目
   */
  versionStatus?: SearchMaterialStatus | null;
  /** 現行の公開版か。false なら処方されていない限り除外 */
  isCurrentVersion?: boolean | null;
  /** この患者が閲覧できるか。false なら除外 */
  accessible?: boolean | null;
};

/** 検索対象のスライド（学習画面の Slide / 公開デモの fixtures の両方の名前を受ける） */
export type SearchSlide = {
  seq: number;
  title: string;
  proposition?: string | null;
  body?: string | null;
  bodyMd?: string | null;
  detail?: string | null;
  detailMd?: string | null;
};

export type MaterialField = "title" | "category" | "summary" | "goal";
export type SlideField = "title" | "proposition" | "body" | "detail";

/** 該当箇所の前後を切り出した文。text.slice(start, end) が該当語 */
export type SearchSnippet = { text: string; start: number; end: number };

export type SlideHit = {
  /** スライド番号（1 始まり。学習画面の seq と同じ） */
  seq: number;
  /** slides 配列での位置（0 始まり） */
  index: number;
  /** スライドの見出し */
  title: string;
  /** 最初に該当した欄 */
  field: SlideField;
  snippet: SearchSnippet;
};

export type MaterialSearchResult<T extends SearchableMaterial> = {
  material: T;
  /** 題名・学習領域・概要・目標のうち該当した欄（従来の検索で見つかる教材は 1 つ以上ある） */
  fields: MaterialField[];
  /** 該当したスライド（番号順） */
  slides: SlideHit[];
  /** 最初に該当したスライドの番号（スライドに該当がなければ null）。学習画面をこの番号で開く */
  firstSlideSeq: number | null;
};

export type MaterialSearchOptions = {
  /** 教材の versionId（なければ id）→ スライド。未取得の教材は題名などだけで探す */
  slidesByVersion?: Readonly<Record<string, readonly SearchSlide[] | undefined>>;
  /** スニペットの前後に残す文字数（既定 18） */
  context?: number;
};

const SNIPPET_CONTEXT = 18;

/** 未承認・閲覧対象外の教材を除く（状態が渡されたときだけ判定。サーバーの assertPatientHasVersion と同じ条件） */
export function isSearchableMaterial(m: SearchableMaterial): boolean {
  if (m.accessible === false) return false;
  if (m.prescribed) return true;
  if (m.versionStatus != null && m.versionStatus !== "published") return false;
  if (m.isCurrentVersion === false) return false;
  return true;
}

const isSpace = (c: string) => /\s/u.test(c);

/** カタカナ → ひらがな（ァ〜ヶ。長音記号などはそのまま） */
function toHiragana(c: string): string {
  const code = c.charCodeAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : c;
}

/** 1 文字（または半角カナ＋濁点・半濁点）の正規化 */
function normalizeUnit(unit: string): string {
  let out = "";
  for (const c of unit.normalize("NFKC")) {
    if (isSpace(c)) continue;
    out += toHiragana(c).toLowerCase();
  }
  return out;
}

/**
 * 検索用に正規化した文字列と、正規化後の各文字が元の文字列のどこから来たか（UTF-16 の位置）。
 * スニペットは元の文字列から切り出す（全角の括弧などを表示用に変えないため）。
 */
function normalizeWithMap(text: string): { norm: string; from: number[]; to: number[] } {
  let norm = "";
  const from: number[] = [];
  const to: number[] = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    let len = cp > 0xffff ? 2 : 1;
    // 半角カナの濁点・半濁点は前の文字と合わせて正規化（ｶﾞ → が）
    const next = text.charCodeAt(i + len);
    if (next === 0xff9e || next === 0xff9f) len += 1;
    const n = normalizeUnit(text.slice(i, i + len));
    for (const c of n) {
      norm += c;
      for (let k = 0; k < c.length; k++) {
        from.push(i);
        to.push(i + len);
      }
    }
    i += len;
  }
  return { norm, from, to };
}

/** 検索語の正規化（全角/半角・カタカナ/ひらがな・大小・空白をそろえる） */
export function normalizeForSearch(text: string): string {
  return normalizeWithMap(text).norm;
}

/** 検索語を空白で分ける（全角空白も区切り）。空の語は除く */
export function splitQuery(query: string): string[] {
  return query
    .normalize("NFKC")
    .split(/\s+/u)
    .map(normalizeForSearch)
    .filter((t) => t.length > 0);
}

/** Markdown の装飾を落として、表示・検索用の平文にする（本文に装飾がない教材ではそのまま） */
export function plainText(md: string | null | undefined): string {
  if (!md) return "";
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** 文の中で最初に該当した語の位置（元の文字列での位置）。どの語も含まなければ null */
function findFirst(text: string, terms: readonly string[]): { start: number; end: number } | null {
  if (!text) return null;
  const { norm, from, to } = normalizeWithMap(text);
  let best: { at: number; len: number } | null = null;
  for (const t of terms) {
    const at = norm.indexOf(t);
    if (at >= 0 && (!best || at < best.at)) best = { at, len: t.length };
  }
  if (!best) return null;
  return { start: from[best.at], end: to[best.at + best.len - 1] };
}

function containsAll(text: string, terms: readonly string[]): boolean {
  const norm = normalizeForSearch(text);
  return terms.every((t) => norm.includes(t));
}

function snippetOf(text: string, start: number, end: number, context: number): SearchSnippet {
  const from = Math.max(0, start - context);
  const to = Math.min(text.length, end + context);
  const head = from > 0 ? "…" : "";
  const tail = to < text.length ? "…" : "";
  return { text: head + text.slice(from, to) + tail, start: head.length + start - from, end: head.length + end - from };
}

function slideTexts(s: SearchSlide): [SlideField, string][] {
  return [
    ["title", s.title ?? ""],
    ["proposition", s.proposition ?? ""],
    ["body", plainText(s.bodyMd ?? s.body)],
    ["detail", plainText(s.detailMd ?? s.detail)],
  ];
}

const keyOf = (m: SearchableMaterial) => String(m.versionId ?? m.id);

/**
 * 教材を探す。空の検索語なら、閲覧できる教材をすべて（並びはそのまま、該当箇所なし）返す。
 *
 * 一致の条件: 検索語を空白で分けた語が、すべて教材のどこか（題名〜スライド）に含まれること。
 * 並び: ① 題名・学習領域・概要・目標に該当（＝従来の検索で見つかる教材。入力の並びのまま）
 *       ② スライドだけに該当（入力の並びのまま）
 */
export function searchMaterials<T extends SearchableMaterial>(
  materials: readonly T[],
  query: string,
  options: MaterialSearchOptions = {},
): MaterialSearchResult<T>[] {
  const allowed = materials.filter(isSearchableMaterial);
  const terms = splitQuery(query);
  if (!terms.length) return allowed.map((material) => ({ material, fields: [], slides: [], firstSlideSeq: null }));
  const context = options.context ?? SNIPPET_CONTEXT;
  const byMeta: MaterialSearchResult<T>[] = [];
  const bySlides: MaterialSearchResult<T>[] = [];
  for (const material of allowed) {
    const meta: [MaterialField, string][] = [
      ["title", material.title ?? ""],
      ["category", material.category ?? ""],
      ["summary", material.summary ?? ""],
      ["goal", material.goal ?? ""],
    ];
    const slides = options.slidesByVersion?.[keyOf(material)] ?? [];
    const whole = [...meta.map(([, t]) => t), ...slides.flatMap((s) => slideTexts(s).map(([, t]) => t))].join("\u0000");
    if (!containsAll(whole, terms)) continue;
    const fields = meta.filter(([, t]) => findFirst(t, terms)).map(([f]) => f);
    const hits: SlideHit[] = [];
    slides.forEach((s, index) => {
      for (const [field, text] of slideTexts(s)) {
        const at = findFirst(text, terms);
        if (!at) continue;
        hits.push({ seq: s.seq, index, title: s.title, field, snippet: snippetOf(text, at.start, at.end, context) });
        break;
      }
    });
    hits.sort((a, b) => a.seq - b.seq);
    const result = { material, fields, slides: hits, firstSlideSeq: hits[0]?.seq ?? null };
    (fields.length ? byMeta : bySlides).push(result);
  }
  return [...byMeta, ...bySlides];
}

/**
 * 変更前の検索（PatientD.tsx の DSearch と同じ条件: 題名＋学習領域＋概要の部分一致、表記ゆれなし）。
 * 比較・テスト用。
 */
export function legacyTitleSearch<T extends SearchableMaterial>(materials: readonly T[], query: string): T[] {
  const q = query.trim();
  return materials.filter((m) => !q || `${m.title}${m.category ?? ""}${m.summary ?? ""}`.includes(q));
}
