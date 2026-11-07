import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SET_COVERS, THEME_IMAGES, THUMBNAILS, setCoverFor, themeImageFor, thumbnailFor } from "@/concept-d/thumbnails";
import { patientSetName } from "@/concept-d/learning";
import { MONEY_THEME, MONEY_TITLES, SIMULATOR_NAME } from "@/concept-d/socialSupport";
import { DEMO_MATERIALS } from "@/server/db/seed-data";

/** 画像の登録: ファイルが public にあり、キーが画面・DB の名前と一致する（書き間違いで表示されない事故を防ぐ） */
describe("画像の登録", () => {
  it("登録したファイルがすべて public にある", () => {
    for (const t of Object.values(THUMBNAILS)) expect(existsSync(`public/thumbnails/${t.file}`), t.file).toBe(true);
    // 教材カード用の縮小版（192px PNG。sips -Z 192 -s format png で作る）。原寸を 48px まで縮めると線画が粗くなるため
    for (const t of Object.values(THUMBNAILS)) expect(existsSync(`public/thumbnails/small/${t.file.replace(/\.webp$/, ".png")}`), `small/${t.file}`).toBe(true);
    for (const t of [...Object.values(SET_COVERS), ...Object.values(THEME_IMAGES)]) expect(existsSync(`public/covers/${t.file}`), t.file).toBe(true);
  });
  it("撮影必須の 6 点が、画面で使う名前で引ける", () => {
    expect(setCoverFor(patientSetName("初回診断時セット"))?.src).toBe("/covers/cover_diagnosis_set.webp");
    expect(themeImageFor(MONEY_THEME)?.src).toBe("/covers/cover_work_money.webp");
    expect(themeImageFor(SIMULATOR_NAME)?.src).toBe("/covers/theme_cost_simulator.webp");
    expect(thumbnailFor("乳がんの診断と病期の考え方")).toMatchObject({ src: "/thumbnails/thumb_diagnosis_staging.webp", band: true });
    expect(thumbnailFor("サブタイプと治療方針のつながり")).toMatchObject({ src: "/thumbnails/thumb_subtypes_treatment.webp", band: true });
    expect(thumbnailFor("こころのケアと相談先")).toMatchObject({ src: "/thumbnails/thumb_emotional_support.webp", band: true });
  });
  it("DB の教材のサムネイルのキーは、シードの教材名と完全一致", () => {
    const seedTitles = new Set(DEMO_MATERIALS.map((m) => m.title));
    for (const key of ["乳がんの診断と病期の考え方", "サブタイプと治療方針のつながり", "こころのケアと相談先", "化学療法中の副作用とセルフケア"]) {
      expect(seedTitles.has(key), key).toBe(true);
      expect(THUMBNAILS[key], key).toBeTruthy();
    }
  });
  it("社会制度の 4 教材の画像は、教材の登録（2026-11）と同時に登録されている", () => {
    for (const t of MONEY_TITLES) expect(thumbnailFor(t), t).not.toBeNull();
    for (const f of ["thumb_work_treatment", "thumb_sickness_allowance", "thumb_high_cost_medical", "thumb_support_contacts"])
      expect(existsSync(`public/thumbnails/${f}.webp`), f).toBe(true);
  });
});
