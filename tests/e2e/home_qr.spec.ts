import { test } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * 患者ホーム（次回診察日・ホームからの質問）。QR 共有の流れは share_flow.spec.ts。
 * 鈴木 美咲（架空）を使い、最後に登録した次回診察日と質問を元に戻す。
 */
const tokyo = (offsetDays: number) => new Date(Date.now() + offsetDays * 864e5).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

test("ホーム: 次回診察日の登録（再読み込みで残る・当日・過去）と、ホームから質問を追加（再読み込みで残る）", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  const p = patient.page;
  await demoLogin(p, "patient", "鈴木 美咲");
  // 未登録: 架空の日付を出さず「次回診察日を登録」
  const card = p.locator(".d-visit-card");
  await expect(card).toContainText("診察日は未登録です");
  await p.locator("[data-visit-edit]").click();
  await p.locator("[data-visit-input]").fill(tokyo(14));
  await p.locator("[data-visit-save]").click();
  await expect(p.locator("[data-visit-days]")).toContainText("次の診察まで あと14日");
  await p.reload();
  await expect(p.locator("[data-visit-days]")).toContainText("あと14日");
  // 診察ノートにも同じ日付
  await p.locator(".d-nav").getByRole("button", { name: "聞きたいこと" }).click();
  await expect(p.locator(".d-visit-date")).toContainText("次回診察日：");
  await expect(p.locator(".d-visit-date")).not.toContainText("未登録");
  await p.locator(".d-nav").getByRole("button", { name: "ホーム" }).click();
  // 当日・過ぎた日
  await p.locator("[data-visit-edit]").click();
  await p.locator("[data-visit-input]").fill(tokyo(0));
  await p.locator("[data-visit-save]").click();
  await expect(p.locator("[data-visit-days]")).toHaveText("今日が診察日です");
  await p.locator("[data-visit-edit]").click();
  await p.locator("[data-visit-input]").fill(tokyo(-2));
  await p.locator("[data-visit-save]").click();
  await expect(p.locator("[data-visit-days]")).toContainText("過ぎました");

  // ホームから質問を追加: 空欄では追加できない。保存に成功したものだけが表示され、再読み込みでも残る
  const add = p.locator("[data-home-note-add]");
  await expect(add).toBeDisabled();
  const text = "治療中の予防接種について聞きたい（E2E）";
  await p.locator("[data-home-note-input]").fill(text);
  await add.click();
  await expect(p.locator(".d-home-ask-list")).toContainText(text);
  await expect(p.locator("[data-home-note-input]")).toHaveValue("");
  await p.reload();
  await expect(p.locator(".d-home-ask-list")).toContainText(text);
  // 他の画面へ移って戻っても残る
  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  await p.locator(".d-nav").getByRole("button", { name: "ホーム" }).click();
  await expect(p.locator(".d-home-ask-list")).toContainText(text);
  await p.locator(".d-nav").getByRole("button", { name: "聞きたいこと" }).click();
  await expect(p.locator(".d-saved-notes")).toContainText(text);

  // 後片付け（この患者を使う他のテストに影響させない）
  const { notes } = await (await p.request.get("/api/v1/notes")).json();
  for (const n of notes.filter((x: { body: string }) => x.body === text)) await p.request.delete(`/api/v1/notes/${n.id}`);
  await p.request.put("/api/v1/next-visit", { data: { date: null } });
  await patient.ctx.close();
});
