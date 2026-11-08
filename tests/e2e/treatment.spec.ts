import { test } from "@playwright/test";
import { demoLogin, expect, newPage, shareByPatientCode } from "./helpers";

/**
 * 2026-11: 治療の記録。患者がホームからがん種と今の治療を登録し、外来の日の出来事（点滴をした）を残すと
 * 「点滴から 1日目（第3コース）」が出る。共有中の医療者には診察サマリーの見出し下に 1 行で出る。架空患者 鈴木 美咲。
 */
test("患者: がん種・治療を登録 → 外来の日に点滴を記録 → ホームに「点滴から 1日目」→ 医療者のサマリーにも 1 行", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  const staff = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(patient.page, "patient", "鈴木 美咲");
  await demoLogin(staff.page, "staff", "佐藤 一郎");
  const p = patient.page;
  const s = staff.page;
  try {
    // ホーム上段のカード → 治療の記録
    await p.locator("[data-home-treatment]").click();
    await expect(p.locator("[data-treatment-page]")).toBeVisible();
    await p.locator("[data-treatment-form]").getByRole("button", { name: "乳がん" }).click();
    await p.locator("[data-modality='infusion']").click();
    await p.locator("[data-treatment-save]").click();
    await expect(p.locator("[data-treatment-status]")).toContainText("乳がん · 点滴の薬物療法");

    // 外来の日の記録: 今日・点滴・第3コース
    await p.locator("[data-treatment-add]").click();
    await p.locator("[data-event-kind='infusion']").click();
    await p.locator("[data-treatment-event-form] input[type=number]").fill("3");
    await p.locator("[data-treatment-event-save]").click();
    await expect(p.locator("[data-treatment-status]")).toContainText("点滴から 1日目");
    await expect(p.locator("[data-treatment-status]")).toContainText("第3コース");
    await expect(p.locator("[data-treatment-event]")).toHaveCount(1);

    // ホームのカードにも
    await p.getByRole("button", { name: "← ホーム" }).click();
    await expect(p.locator("[data-home-treatment]")).toContainText("点滴から 1日目");

    // 医療者: 共有中だけ、見出し下に 1 行
    await shareByPatientCode(s, p);
    const line = s.locator("[data-treatment-line]");
    await expect(line).toBeVisible({ timeout: 15_000 });
    await expect(line).toContainText("乳がん");
    await expect(line).toContainText("点滴から 1日目");
    await expect(line).toContainText("第3コース");
    const sid = new URL(s.url()).searchParams.get("s") ?? (await (await s.request.get("/api/v1/staff/live")).json()).activeSessionId;
    await s.request.post(`/api/v1/consultations/${sid}/end`, { data: {} });
    expect((await s.request.get(`/api/v1/consultations/${sid}/treatment`)).status()).toBe(403);
  } finally {
    // 後片付け: 出来事を消し、治療を未設定に戻す（他のテストの患者ホームに影響させない）
    const { events } = await (await p.request.get("/api/v1/treatment")).json();
    for (const e of events as { id: string }[]) await p.request.delete(`/api/v1/treatment/events/${e.id}`);
    await p.request.put("/api/v1/treatment", { data: { cancerType: null, modality: "none" } });
    await staff.ctx.close();
    await patient.ctx.close();
  }
});
