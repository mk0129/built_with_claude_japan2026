import { test } from "@playwright/test";
import { demoLogin, expect, newPage, shareByPatientCode } from "./helpers";

/**
 * 2026-11: 教材ライブラリで選んだ教材を、自分の施設のセットとして名前を付けて保存できる。
 * 保存したセットはすぐ一覧に出て、次からは「まとめて追加」で 1 回で選べる。架空患者 鈴木 美咲。
 */
test("医療者: 選択中の教材をセットとして保存 → セットの一覧に出る", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  const staff = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(patient.page, "patient", "鈴木 美咲");
  await demoLogin(staff.page, "staff", "佐藤 一郎");
  const s = staff.page;
  await shareByPatientCode(s, patient.page);

  const sid = new URL(s.url()).searchParams.get("s") ?? (await (await s.request.get("/api/v1/staff/live")).json()).activeSessionId;
  try {
  await s.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  const rows = s.locator(".cd-library-grid article");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  // 追加できる行の先頭を 1 件ずつ選ぶ（選ぶと「選択済み」になり先頭が入れ替わるので、題名は押す直前に取る）
  const addable = rows.filter({ has: s.getByRole("button", { name: /処方に追加/ }) });
  const pick = async () => {
    const row = addable.first();
    const title = await row.locator("b").first().innerText();
    await row.getByRole("button", { name: /処方に追加/ }).click();
    return title;
  };
  const titles = [await pick(), await pick()];
  await expect(s.locator("[data-select-tray]")).toContainText("選択中 2件");

  const name = `E2E セット ${Date.now() % 100000}`;
  await s.locator("[data-save-set]").click();
  await s.locator("[data-save-set-form] input").fill(name);
  await s.locator("[data-save-set-form]").getByRole("button", { name: "保存" }).click();
  await expect(s.locator("[data-set-saved]")).toContainText(name);
  const set = s.locator(`[data-template-name="${name}"]`);
  await expect(set).toBeVisible();
  await expect(set).toContainText("2件");
  await expect(set).toContainText(titles[0]);
  await expect(set).toContainText(titles[1]);
  // 2 件とも選択中なので「選択に追加済み」
  await expect(set.getByRole("button", { name: "選択に追加済み" })).toBeDisabled();
  } finally {
    // 途中で失敗しても共有を終える（同じ医療者を使う他のテストに共有が残らないように）
    await s.request.post(`/api/v1/consultations/${sid}/end`, { data: {} });
    await staff.ctx.close();
    await patient.ctx.close();
  }
});
