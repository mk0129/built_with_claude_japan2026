/**
 * 教材 v1.1（編集草稿・医学的監修前・利用許諾確認前）を、レビュー用の開発 DB に「新しい下書き」として取り込む。
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5800/postgres \
 *     npx tsx scripts/review/import-materials-draft.ts ~/Developer/shiori-assets-review/content/shiori_materials_draft_v1.1.json
 *
 * - 原稿 JSON はリポジトリに入れない（引数のパスから読む）。出典冊子の PDF・画像は扱わない。Claude には送らない。
 * - 既存の教材・公開版・クイズ・患者の学習履歴は変更しない（同じ題名の教材が既にあれば取り込まない）。
 * - 教材は施設内（さくら総合病院・架空）の下書き（draft）。公開版を持たないため、患者の一覧・処方候補には出ない。
 * - 原資料として「v1.1 原稿」を登録し、AI 処理・患者向け公開・他施設共有を「許可なし」にする。
 *   承認は既存の権限確認（原資料に患者向け公開の許可がない）で止まり、公開できない。
 * - 接続先がローカル（127.0.0.1 / localhost）でない、または本番環境の設定のときは何もしない。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";

type V11 = {
  version: string;
  source_note: string;
  materials: {
    id: string;
    title: string;
    domain: string;
    summary: string;
    objectives: string[];
    slides: { seq: number; title: string; proposition: string; bodyMd: string; detailMd: string | null; voiceText: string | null }[];
    quiz: { seq: number; stem: string; options: string[]; correctIndex: number; explanation: string }[];
    status: { medical: string; rights: string; publication: string };
  }[];
};

/** v1.1 の領域名 → アプリの領域タグ。「診断・治療選択」に一致する領域はないため、最も近い「検査・診断」に入れる（報告対象） */
const DOMAIN: Record<string, string> = {
  "診断・治療選択": "diagnosis_staging",
  "検査・診断": "diagnosis_staging",
  "副作用・支持療法": "side_effects_daily_life",
  "日常生活・相談支援": "mental_care_support",
};
/** 学習領域とは別の検索用タグ（表示名のまま保存。新しい学習領域は追加しない）。D03 は「検査・診断」に暫定配置し「治療選択」を付ける */
const EXTRA_TAGS: Record<string, string[]> = { "診断・治療選択": ["治療選択"] };
export const V11_CHANGE_NOTE = "教材 v1.1 編集草稿（レビュー用に取り込み）。医学的監修・利用許諾の確認前。公開・情報処方・AI 送信は不可。";

export type ImportResult = { title: string; versionId: string | null; skipped: boolean }[];

/** 取り込み本体（テストからも使う）。db はシード済みの開発 DB */
export async function importV11(db: import("@/server/db/client").Db, raw: Buffer): Promise<ImportResult> {
  const data = JSON.parse(raw.toString("utf8")) as V11;
  const { materials, materialVersions, materialSlides, quizQuestions, organizations, sourceDocuments, sourcePermissions, user } = await import("@/server/db/schema");
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "sakura-general")).limit(1);
  const [editor] = await db.select().from(user).where(eq(user.email, "approver.sato@example.com")).limit(1);
  if (!org || !editor) throw new Error("架空の施設・アカウントが見つかりません（シード済みの開発 DB か確認）");

  // 原稿を原資料として登録（ファイルは保存しない）。AI・公開・共有は許可しない
  const sha256 = createHash("sha256").update(raw).digest("hex");
  let [src] = await db.select().from(sourceDocuments).where(and(eq(sourceDocuments.sha256, sha256), eq(sourceDocuments.ownerOrgId, org.id))).limit(1);
  if (!src) {
    const text = data.materials.map((m) => [`# ${m.title}`, ...m.slides.map((s) => `## ${s.seq}. ${s.title}\n${s.bodyMd}\n${s.detailMd ?? ""}`)].join("\n\n")).join("\n\n");
    [src] = await db
      .insert(sourceDocuments)
      .values({
        ownerOrgId: org.id,
        title: `教材 v${data.version} 編集草稿（独自原稿・レビュー用）`,
        storageKey: "review-only/not-stored",
        mime: "application/json",
        sizeBytes: raw.length,
        sha256,
        textSource: "manual",
        extractedText: text,
        extractionWarning: "医学的監修・利用許諾の確認前の原稿。レビュー環境でのみ表示。",
        extractionMeta: { charCount: text.length },
        piiAttestedNone: true,
        uploadedByUserId: editor.id,
      })
      .returning();
    await db.insert(sourcePermissions).values({
      sourceId: src.id,
      allowStore: true,
      allowAi: false,
      allowDerive: false,
      allowPublish: false,
      allowShare: false,
      rightsHolder: "出典冊子の権利者（利用許諾は未確認）",
      evidenceNote: data.source_note,
      restrictions: "医学的監修・利用許諾の確認まで、公開・情報処方・AI 送信をしない",
      checkedByUserId: editor.id,
      checkedAt: new Date(),
    });
  }

  const result: ImportResult = [];
  for (const m of data.materials) {
    const [dup] = await db.select({ id: materials.id }).from(materials).where(and(eq(materials.title, m.title), eq(materials.ownerOrgId, org.id))).limit(1);
    if (dup) {
      result.push({ title: m.title, versionId: null, skipped: true });
      continue;
    }
    if (m.slides.length !== 5 || m.quiz.length !== 3 || m.quiz.some((q) => q.options.length !== 3 || q.correctIndex < 0 || q.correctIndex > 2))
      throw new Error(`形式が想定と異なります: ${m.title}`);
    const domain = DOMAIN[m.domain];
    if (!domain) throw new Error(`領域が対応表にありません: ${m.domain}`);
    const versionId = await db.transaction(async (tx) => {
      const [mat] = await tx.insert(materials).values({ scope: "org", ownerOrgId: org.id, primaryDomain: domain, title: m.title, tags: [domain, ...(EXTRA_TAGS[m.domain] ?? [])] }).returning();
      const [ver] = await tx
        .insert(materialVersions)
        .values({
          materialId: mat.id,
          versionNo: 1,
          status: "draft",
          summary: m.summary,
          learningObjectives: m.objectives,
          sourceDocumentIds: [src.id],
          createdByUserId: editor.id,
          changeNote: V11_CHANGE_NOTE,
        })
        .returning();
      await tx.insert(materialSlides).values(
        m.slides.map((s) => ({
          materialVersionId: ver.id,
          seq: s.seq,
          title: s.title,
          // v1.1 は全画面で proposition が題名と同じ。題名と同じ文を見出しの直下に重ねて出さないよう、要点（命題）は空にして本文を表示する
          proposition: s.proposition.trim() === s.title.trim() ? null : s.proposition,
          bodyMd: s.bodyMd,
          detailMd: s.detailMd || null,
          voiceText: s.voiceText || null,
          sourceRefs: [],
        })),
      );
      await tx.insert(quizQuestions).values(
        m.quiz.map((q) => ({
          materialVersionId: ver.id,
          seq: q.seq,
          stem: q.stem,
          options: q.options as [string, string, string],
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          relatedSlideSeq: null,
          sourceRefs: [],
        })),
      );
      return ver.id;
    });
    result.push({ title: m.title, versionId, skipped: false });
  }
  return result;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("原稿 JSON のパスを指定してください");
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(127\.0\.0\.1|localhost):\d+\//.test(url)) throw new Error("ローカルの開発 DB（127.0.0.1）以外には取り込みません");
  const { isProductionEnv } = await import("@/server/demo");
  if (isProductionEnv()) throw new Error("本番環境の設定では取り込みません");
  const { getDb } = await import("@/server/db/client");
  for (const r of await importV11(getDb(), readFileSync(file)))
    console.log(r.skipped ? `skip（同じ題名の教材があります）: ${r.title}` : `draft: ${r.title} versionId=${r.versionId}`);
}

if (process.argv[1]?.endsWith("import-materials-draft.ts")) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    },
  );
}
