import { describe, expect, it } from "vitest";
import { legacyTitleSearch, normalizeForSearch, searchMaterials, type SearchSlide, type SearchableMaterial } from "@/concept-d/materialSearch";
import { toLesson, type LibraryApiItem, type LiveLesson } from "@/concept-d/learning";
import { SEED_CONTENT } from "@/server/db/seed-content";
// 審査用公開デモの架空患者（佐藤 花子）が閲覧できる教材一覧とスライド（公式 seed から書き出したもの）
import consultation from "../../.judge-demo/app/fixtures/consultation.json";
import lessonsJson from "../../.judge-demo/app/fixtures/lessons.json";

type FixtureLesson = { title: string; versionId: string; slides: { seq: number; title: string; body: string; proposition?: string; detail?: string }[] };
const fixtureLessons = lessonsJson as Record<string, FixtureLesson>;
const items = consultation.library.items as unknown as LibraryApiItem[];
const objectiveOf = (materialId: string) => consultation.materials.items.find((m) => m.materialId === materialId)?.objectives[0] ?? null;

/** PatientD.tsx の visibleLessons と同じ形（learning.ts の toLesson） */
const lessons: LiveLesson[] = items.map((i) => toLesson({ ...i, objective: objectiveOf(i.materialId) }));
const slidesByVersion: Record<string, SearchSlide[]> = Object.fromEntries(Object.values(fixtureLessons).map((l) => [l.versionId, l.slides]));

const titleOf = (id: string) => lessons.find((l) => l.id === id)!.title;
const search = (q: string, list: readonly SearchableMaterial[] = lessons) => searchMaterials(list, q, { slidesByVersion });
const summary = (q: string) => search(q).map((r) => ({ title: r.material.title, slides: r.slides.map((s) => [s.seq, s.title]) }));

describe("教材検索（題名＋本文＋スライド）", () => {
  it("前提: 公開デモの教材は公式 seed の本文と同じ", () => {
    for (const l of Object.values(fixtureLessons)) {
      const seed = SEED_CONTENT.find((c) => c.title === l.title);
      expect(seed, l.title).toBeTruthy();
      expect(l.slides.map((s) => s.body)).toEqual(seed!.slides.map((s) => s.body));
    }
  });

  it("「食事」: 従来は 0 件。化学療法中の副作用とセルフケアの 2 枚目（吐き気・食欲が落ちたとき）に当たる", () => {
    expect(legacyTitleSearch(lessons, "食事")).toEqual([]);
    expect(summary("食事")).toEqual([{ title: "化学療法中の副作用とセルフケア", slides: [[2, "吐き気・食欲が落ちたとき"]] }]);
    const hit = search("食事")[0].slides[0];
    expect(hit.field).toBe("proposition"); // 見出しの下の要点に先に当たる（本文にもある）
    expect(hit.snippet.text.slice(hit.snippet.start, hit.snippet.end)).toBe("食事");
    expect(hit.snippet.text).toContain("食事は少量ずつで大丈夫です");
  });

  it("「吐き気」: 従来は 0 件。化学療法中の副作用とセルフケアの 1・2・5 枚目に当たる", () => {
    expect(legacyTitleSearch(lessons, "吐き気")).toEqual([]);
    expect(summary("吐き気")).toEqual([
      { title: "化学療法中の副作用とセルフケア", slides: [[1, "副作用の出方は人それぞれ"], [2, "吐き気・食欲が落ちたとき"], [5, "すぐに連絡するサイン"]] },
    ]);
    const r = search("吐き気")[0];
    expect(r.firstSlideSeq).toBe(1);
    expect(r.slides.map((s) => s.field)).toEqual(["body", "title", "body"]);
    expect(r.slides.map((s) => s.index)).toEqual([0, 1, 4]);
  });

  it("「腕」: 従来は 0 件。手術後の生活（2・3・4 枚目）と術後リンパ浮腫外来（1・2 枚目）に当たる", () => {
    expect(legacyTitleSearch(lessons, "腕")).toEqual([]);
    expect(summary("腕")).toEqual([
      { title: "手術後の生活と気をつけること", slides: [[2, "腕のリハビリ"], [3, "リンパ浮腫の予防"], [4, "まとめ"]] },
      { title: "さくら総合病院 術後リンパ浮腫外来", slides: [[1, "リンパ浮腫外来とは"], [2, "受診の目安"]] },
    ]);
  });

  it("従来の検索（題名・学習領域・概要）で見つかる教材は、同じ並びで先頭に出る", () => {
    for (const q of ["手術", "副作用", "放射線", "さくら", "HER2", "薬物療法", "リンパ浮腫", "相談", "乳がん", "検査・診断"]) {
      const legacy = legacyTitleSearch(lessons, q).map((l) => l.id);
      const now = search(q);
      expect(legacy.length, q).toBeGreaterThan(0);
      expect(now.slice(0, legacy.length).map((r) => r.material.id), q).toEqual(legacy);
      for (const r of now.slice(0, legacy.length)) expect(r.fields.length, `${q} ${r.material.title}`).toBeGreaterThan(0);
    }
  });

  it("スライドがまだ取れていない教材は、従来どおり題名などだけで探す", () => {
    const r = searchMaterials(lessons, "腕");
    expect(r).toEqual([]);
    expect(searchMaterials(lessons, "リンパ浮腫").map((x) => x.material.title)).toEqual(legacyTitleSearch(lessons, "リンパ浮腫").map((l) => l.title));
  });

  it("該当がなければ空", () => {
    expect(search("宇宙旅行")).toEqual([]);
    expect(search("腕 宇宙旅行")).toEqual([]);
  });

  it("空白で区切った語は、すべてを含む教材だけ", () => {
    expect(search("腕 むくみ").map((r) => r.material.title)).toEqual(["手術後の生活と気をつけること", "さくら総合病院 術後リンパ浮腫外来"]);
    expect(search("腕　放射線")).toEqual([]);
  });

  it("全角/半角・カタカナ/ひらがな・英字の大小・空白の違いをそろえる", () => {
    expect(normalizeForSearch("ﾘﾝﾊﾟ浮腫 ＨＥＲ２")).toBe(normalizeForSearch("りんぱ浮腫her2"));
    expect(search("ﾘﾝﾊﾟ浮腫").map((r) => r.material.id)).toEqual(search("リンパ浮腫").map((r) => r.material.id));
    expect(search("りんぱふしゅ")).toEqual([]); // 読みがなの展開はしない
    expect(search("her2").map((r) => titleOf(String(r.material.id)))).toContain("サブタイプと治療方針のつながり");
    const her2 = search("ｈｅｒ２").find((r) => r.material.title === "サブタイプと治療方針のつながり")!;
    expect(her2.slides.map((s) => s.seq)).toEqual([1, 3]); // 2 枚目（ホルモン受容体）には HER2 の語がない
    const s = her2.slides[0].snippet;
    expect(s.text.slice(s.start, s.end)).toBe("HER2"); // スニペットは元の表記のまま
  });

  it("空の検索語: 閲覧できる教材をすべて、そのままの並びで返す", () => {
    for (const q of ["", "  ", "　"]) {
      const r = search(q);
      expect(r.map((x) => x.material.id)).toEqual(lessons.map((l) => l.id));
      expect(r.every((x) => x.slides.length === 0 && x.fields.length === 0 && x.firstSlideSeq === null)).toBe(true);
    }
  });

  it("未承認・閲覧対象外の教材は、本文に該当があっても出さない（空の検索語でも）", () => {
    const leaked = "腕のしびれの特別な説明";
    const extra: SearchableMaterial[] = [
      { id: "draft", versionId: "v-draft", title: "下書きの教材 腕", versionStatus: "draft" },
      { id: "review", versionId: "v-review", title: "承認待ちの教材 腕", versionStatus: "in_review" },
      { id: "retired", versionId: "v-retired", title: "取り下げた教材 腕", versionStatus: "retired" },
      { id: "old", versionId: "v-old", title: "旧版の教材 腕", versionStatus: "published", isCurrentVersion: false },
      { id: "other-org", versionId: "v-other", title: "他院の独自教材 腕", versionStatus: "published", accessible: false },
      { id: "rx-other", versionId: "v-rx-other", title: "閲覧できない処方 腕", prescribed: true, accessible: false },
      { id: "rx-old", versionId: "v-rx-old", title: "処方された旧版", prescribed: true, versionStatus: "retired", isCurrentVersion: false },
    ];
    const slides: Record<string, SearchSlide[]> = { ...slidesByVersion };
    for (const m of extra) slides[String(m.versionId)] = [{ seq: 1, title: "説明", body: leaked }];
    const list = [...lessons, ...extra];
    const ids = (q: string) => searchMaterials(list, q, { slidesByVersion: slides }).map((r) => String(r.material.id));
    for (const q of ["腕", "しびれ", "教材", ""]) {
      for (const bad of ["draft", "review", "retired", "old", "other-org", "rx-other"]) expect(ids(q), `${q}: ${bad}`).not.toContain(bad);
    }
    // 処方された版は旧版でも閲覧できる（サーバーの assertPatientHasVersion と同じ）
    expect(ids("しびれ")).toEqual(["rx-old"]);
    expect(ids("腕")).toEqual([...search("腕").map((r) => String(r.material.id)), "rx-old"]);
  });
});
