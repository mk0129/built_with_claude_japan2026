import { test, type Page } from "@playwright/test";
import { SHOT_DIR, demoLogin, expect, layoutAudit, newPage, openRegisterForm, showQrCode } from "./helpers";

/**
 * P0 回帰（2026-11-03）: UX-01 横スクロール / UX-02 内部表記 / UX-03 構成案の見つけやすさ / UX-04 承認前プレビュー / UX-10 共有終了の安定性。
 * 擬似生成モード（Claude は呼ばない）。架空データのみ。
 */
const STUDIO_WIDTHS = [
  { name: "375", width: 375, height: 667 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
];

async function registerSource(s: Page, title: string) {
  await s.goto("/staff/studio");
  await openRegisterForm(s);
  await s.getByLabel("原資料ファイル").setInputFiles("tests/fixtures/sources/hormone_therapy_demo.docx");
  await s.getByLabel("資料名").fill(title);
  await s.getByLabel("許諾元（著作権者・作成部署）").fill("さくら総合病院（架空）乳腺外科");
  await s.getByLabel("許諾の根拠・確認内容").fill("P0 回帰テスト用の架空資料");
  for (const l of ["AI（Claude）で処理してよい", "改変・要約した教材を作ってよい", "患者向けに Web 公開してよい"]) await s.getByLabel(l).check();
  await s.getByLabel(/患者さんの個人情報.*含まないことを確認しました/).check();
  await s.getByRole("button", { name: "登録する" }).click();
  await s.getByRole("link", { name: "原資料の画面へ" }).click();
  await s.waitForURL(/\/staff\/studio\/sources\//);
  return s.url();
}

test("UX-03 / UX-04: 構成案は操作の直下に出て画面内に入る。下書きは承認前でも患者画面でプレビューでき、患者 API では見えない", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page: s } = await newPage(browser, { width: 820, height: 1180 });
  await demoLogin(s, "staff", "佐藤 一郎");
  const stamp = Date.now().toString().slice(-5);
  const sourceUrl = await registerSource(s, `ホルモン療法を続けるために（P0 ${stamp}）`);

  // UX-03: 「構成案を作る」→ 結果領域（操作の直下）に構成案が出て、見出しが画面内に入る
  await s.getByRole("button", { name: "構成案を作る" }).click();
  const result = s.getByTestId("generation-result");
  await expect(result.getByRole("heading", { name: /Claude の構成案/ })).toBeVisible({ timeout: 60_000 });
  await expect(result.getByText(/次のステップ: 1 つ選んで/)).toBeVisible();
  const heading = result.getByRole("heading", { name: /Claude の構成案/ });
  await s.waitForTimeout(800); // smooth scroll
  const box = await heading.boundingBox();
  expect(box, "構成案の見出しが取得できる").not.toBeNull();
  expect(box!.y, "構成案の見出しが画面内にある（自動スクロール）").toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(1180);
  await s.screenshot({ path: `${SHOT_DIR}/p0_ux03_outline_result_820.png`, fullPage: false });
  // 構成案の違いが分かる要素（学習目標・画面構成・特徴）がカードにある
  await expect(result.getByText("学習目標").first()).toBeVisible();
  await expect(result.getByText(/画面構成（\d+ 画面）/).first()).toBeVisible();
  await expect(result.getByText(/根拠（原資料のどこに基づくか）/).first()).toBeVisible();

  // 案を選ぶ → ステップ 3（必須事項の確認）が同じ領域に出る → 生成 → 「下書きができました」
  await result.getByRole("button", { name: "この案で進む" }).first().click();
  await expect(result.getByText(/ステップ 3: 必須事項を確認/)).toBeVisible();
  await expect(result.getByRole("radio", { name: "この教材で必須" }).first()).toBeVisible();
  await s.screenshot({ path: `${SHOT_DIR}/p0_ux03_must_cover_step_820.png`, fullPage: false });
  await result.getByRole("button", { name: /件を含めて教材・クイズを生成する/ }).click();
  await expect(result.getByText("下書きができました")).toBeVisible({ timeout: 60_000 });
  await s.screenshot({ path: `${SHOT_DIR}/p0_ux03_draft_ready_820.png`, fullPage: false });
  // 以前の構成案ジョブは履歴に入り、画面上部の情報階層（操作 → 最新の結果 → 履歴）が保たれる
  await expect(s.getByText(/これまでの作成履歴（\d+）/)).toBeVisible();

  await result.getByRole("link", { name: /下書きを確認・編集する/ }).click();
  await s.waitForURL(/\/staff\/studio\/materials\//);
  const versionId = s.url().split("/materials/")[1].split(/[/?#]/)[0];

  // UX-02: 編集画面に内部コード（drug_therapy 等）が出ない。領域は日本語
  const body = await s.locator("body").innerText();
  expect(body).not.toMatch(/drug_therapy|diagnosis_staging|side_effects_daily_life|mental_care_support|fake:/);
  await expect(s.getByLabel("領域")).toBeVisible();
  const selected = await s.getByLabel("領域").evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent);
  expect(selected).toMatch(/[ぁ-んァ-ン一-龥]/);

  // UX-04: 下書きの編集画面に「患者画面でプレビュー」があり、プレビューが開く
  const preview = s.getByRole("link", { name: "患者画面でプレビュー" }).first();
  await expect(preview).toBeVisible();
  await s.screenshot({ path: `${SHOT_DIR}/p0_ux04_editor_preview_link_820.png`, fullPage: false });
  await preview.click();
  await s.waitForURL(/\/staff\/materials\/.*\/preview/);
  await expect(s.getByText(/患者画面プレビュー/)).toBeVisible();
  await expect(s.getByText(/「下書き」のため、患者さんには表示されません/)).toBeVisible();
  await expect(s.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(s.getByRole("link", { name: /編集・承認画面へ/ })).toBeVisible();
  await s.screenshot({ path: `${SHOT_DIR}/p0_ux04_draft_preview_820.png`, fullPage: true });

  // 一般の医療者（編集権限なし）はプレビュー API も画面も不可
  const plain = await newPage(browser, { width: 820, height: 1180 });
  await demoLogin(plain.page, "staff", "山田 太郎");
  const r1 = await plain.page.request.get(`/api/v1/admin/materials/${versionId}/preview`);
  expect(r1.status()).toBe(403);
  await plain.ctx.close();

  // 患者は未承認の下書きを学習 API で取得できない（公開判定は変更していない）
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const r2 = await patient.page.request.get(`/api/v1/learn/${versionId}`);
  expect([403, 404]).toContain(r2.status());
  const r3 = await patient.page.request.get(`/api/v1/admin/materials/${versionId}/preview`);
  expect(r3.status()).toBe(403);
  await patient.ctx.close();

  // UX-01: スタジオ 3 画面を 375〜1180 で横スクロールなし
  const editorUrl = `/staff/studio/materials/${versionId}`;
  const overflow: string[] = [];
  for (const vp of STUDIO_WIDTHS) {
    const { ctx: c, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "staff", "佐藤 一郎");
    for (const [label, url] of [
      ["studio_top", "/staff/studio"],
      ["source", sourceUrl],
      ["editor", editorUrl],
    ] as const) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      const a = await layoutAudit(page);
      if (a.overflowX > 0) overflow.push(`${label}@${vp.name}: +${a.overflowX}px`);
      if (label === "studio_top") await page.screenshot({ path: `${SHOT_DIR}/p0_ux01_studio_top_${vp.name}.png`, fullPage: false });
    }
    await c.close();
  }
  expect(overflow, "横スクロールが発生した画面").toEqual([]);
  await ctx.close();
});

test("UX-02: 医療者ホームと診察画面に内部表記・開発者向け文言が出ない", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const staff = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(staff.page, "staff", "佐藤 一郎");
  await staff.page.goto("/staff");
  await staff.page.waitForLoadState("networkidle");
  const home = await staff.page.locator("body").innerText();
  expect(home).not.toMatch(/\b(clinician|material_editor|material_approver|org_admin)\b/);
  expect(home).toMatch(/教材承認/);
  await staff.page.screenshot({ path: `${SHOT_DIR}/p0_ux02_staff_home_1180.png`, fullPage: false });

  const code = await showQrCode(patient.page);
  await staff.page.goto("/staff/scan");
  await staff.page.getByLabel("6桁の番号").fill(code);
  await staff.page.getByRole("button", { name: /共有を要求する/ }).click();
  await patient.page.getByRole("button", { name: "許可する" }).click({ timeout: 10_000 });
  await staff.page.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });
  await expect(staff.page.getByText(/佐藤 花子 さん/)).toBeVisible({ timeout: 15_000 });
  await staff.page.getByRole("button", { name: "開く" }).click();
  await staff.page.getByRole("button", { name: "検索" }).click();
  await staff.page.waitForTimeout(300);
  const consult = await staff.page.locator("body").innerText();
  expect(consult).not.toMatch(/後続フェーズ|四捨五入|MVP|drug_therapy|clinician/);
  await staff.page.screenshot({ path: `${SHOT_DIR}/p0_ux02_prescribe_panel_1180.png`, fullPage: false });
  await staff.page.getByRole("button", { name: "終了", exact: true }).click();
  await staff.ctx.close();
  await patient.ctx.close();
});

test("UX-10: 「共有を終了する」は連続 3 回とも 1 回の操作で終了し、サーバー側で即時に無効化される。医療者が先に終了した場合も患者画面は詰まらない", async ({ browser }) => {
  test.setTimeout(180_000);
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const staff = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(staff.page, "staff", "山田 太郎");

  async function startSharing() {
    const code = await showQrCode(patient.page);
    await staff.page.goto("/staff/scan");
    await staff.page.getByLabel("6桁の番号").fill(code);
    await staff.page.getByRole("button", { name: /共有を要求する/ }).click();
    await patient.page.getByRole("button", { name: "許可する" }).click({ timeout: 10_000 });
    await staff.page.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });
    await expect(staff.page.getByText(/佐藤 花子 さん/)).toBeVisible({ timeout: 15_000 });
    return staff.page.url().split("/consult/")[1].split(/[/?#]/)[0];
  }

  for (let i = 0; i < 3; i++) {
    const sessionId = await startSharing();
    const endBtn = patient.page.getByRole("button", { name: /共有を終了する/ });
    await expect(endBtn).toBeVisible({ timeout: 10_000 });
    if (i === 0) await patient.page.screenshot({ path: `${SHOT_DIR}/p0_ux10_sharing_390.png`, fullPage: false });
    await endBtn.click({ timeout: 5_000 });
    // 1 回の操作で、次回ポーリングを待たずに QR ボタンへ戻る
    await expect(patient.page.getByRole("button", { name: /QR コードを表示する/ })).toBeVisible({ timeout: 3_000 });
    if (i === 0) await patient.page.screenshot({ path: `${SHOT_DIR}/p0_ux10_after_end_390.png`, fullPage: false });
    // サーバー側: 医療者の患者データ取得は 403
    const r = await staff.page.request.get(`/api/v1/consultations/${sessionId}/patient`);
    expect(r.status(), `iteration ${i}: staff access after patient ended`).toBe(403);
    // 医療者画面にも終了が伝わる
    await expect(staff.page.getByText(/患者さんが共有を終了しました/)).toBeVisible({ timeout: 20_000 });
  }

  // 医療者が先に終了 → 患者画面は「共有は終了しました」→ 閉じる → QR ボタン
  const sessionId = await startSharing();
  await expect(patient.page.getByRole("button", { name: /共有を終了する/ })).toBeVisible({ timeout: 10_000 });
  await staff.page.getByRole("button", { name: "終了", exact: true }).click();
  await expect(patient.page.getByText("共有は終了しました")).toBeVisible({ timeout: 10_000 });
  await expect(patient.page.getByText("医療者が終了しました。")).toBeVisible();
  await patient.page.screenshot({ path: `${SHOT_DIR}/p0_ux10_ended_by_staff_390.png`, fullPage: false });
  await patient.page.getByRole("button", { name: /^閉じる$/ }).click();
  await expect(patient.page.getByRole("button", { name: /QR コードを表示する/ })).toBeVisible({ timeout: 3_000 });
  expect((await staff.page.request.get(`/api/v1/consultations/${sessionId}/patient`)).status()).toBe(403);

  await staff.ctx.close();
  await patient.ctx.close();
});
