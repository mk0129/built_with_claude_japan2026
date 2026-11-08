import { test } from "@playwright/test";
import { demoLogin, expect, newPage, shareByPatientCode } from "./helpers";

/**
 * 2026-11: 医療者が診察で答えた質問を、診察サマリーの「解決」1 タップで消せる（未解決の数字も減る）。
 * 患者側では「聞けた質問」に移る。共有の外では解決にできない（API は 403）。架空患者 鈴木 美咲。
 */
test("医療者: 診察サマリーの質問を「解決」にすると数字が減り、患者側では「聞けた」に移る", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  const staff = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(patient.page, "patient", "鈴木 美咲");
  await demoLogin(staff.page, "staff", "佐藤 一郎");
  const p = patient.page;
  const s = staff.page;

  // 患者: ホームから質問を 1 件
  const text = "点滴の日は食事を控えたほうがよいですか？（E2E）";
  await p.locator("[data-home-note-input]").fill(text);
  await p.locator("[data-home-note-add]").click();
  await expect(p.locator("[data-home-note-count]")).toContainText("1件");

  // 共有 → 医療者のサマリーに未解決として出る
  await shareByPatientCode(s, p);
  const q = s.locator("[data-questions] article").filter({ hasText: text });
  await expect(q).toBeVisible({ timeout: 15_000 });
  const before = Number((await s.locator("[data-point='questions'] b").textContent()) ?? "0");
  expect(before).toBeGreaterThanOrEqual(1);

  // 「解決」1 タップ → 一覧から消え、要点の帯とサイドバーの数字が減る
  await q.locator("[data-question-resolve]").click();
  await expect(q).toHaveCount(0, { timeout: 10_000 });
  await expect(s.locator("[data-point='questions'] b")).toHaveText(String(before - 1));
  // 解決した質問の一覧に残り、「戻す」こともできる
  await s.locator(".cd-resolved-toggle").click();
  await expect(s.locator(".cd-resolved-list")).toContainText(text);

  // 患者側: 聞けた質問に移っている（原文はそのまま）
  await p.goto("/home?view=notes");
  await expect(p.locator(".d-saved-notes")).not.toContainText(text);
  await p.locator(".d-notes-resolved-toggle").click();
  await expect(p.locator(".d-notes-resolved")).toContainText(text);

  // 共有を終えたあとは解決の操作が 403
  const sid = new URL(s.url()).searchParams.get("s") ?? (await (await s.request.get("/api/v1/staff/live")).json()).activeSessionId;
  const { notes } = await (await p.request.get("/api/v1/notes")).json();
  const note = notes.find((n: { body: string }) => n.body === text);
  await s.request.post(`/api/v1/consultations/${sid}/end`, { data: {} });
  expect((await s.request.post(`/api/v1/consultations/${sid}/notes/${note.id}`, { data: { resolved: false } })).status()).toBe(403);

  // 後片付け
  await p.request.delete(`/api/v1/notes/${note.id}`);
  await staff.ctx.close();
  await patient.ctx.close();
});
