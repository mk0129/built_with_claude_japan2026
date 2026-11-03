import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VIEWPORTS, demoLogin, expect, newPage, openRegisterForm, showQrCode } from "./helpers";

/**
 * 実 API 検証（npm run e2e:real）: B 方式と C 方式で実際に Claude に生成させ、
 * 編集（看護師・編集者）→ 承認（別の承認者）→ 公開 → 処方 → 患者の学習・確認問題まで通す。
 * 生成結果・使用量は docs/day5/real_generation/ に JSON で書き出し、scripts/render-generation-report.mjs で報告書にする。
 * 通常の npm run e2e では擬似生成で同じ手順を確認する（書き出し先は一時ディレクトリ）。
 */
const REAL = process.env.E2E_CLAUDE === "real";
const SHOT = process.env.E2E_SHOT_DIR ?? (REAL ? "docs/screenshots/day5_real" : join(tmpdir(), "shiori-e2e-shots"));
const OUT = REAL ? (process.env.E2E_REAL_OUT ?? `docs/day5/real_generation/run_${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}`) : join(tmpdir(), `shiori-e2e-export-${Date.now()}`);
const JOB_WAIT = REAL ? 420_000 : 60_000;
mkdirSync(SHOT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const shot = async (page: Page, name: string, fullPage = true) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage });
};
const save = (name: string, data: unknown) => writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));

async function latestJob(page: Page, mode: string) {
  const r = await page.request.get("/api/v1/studio/jobs");
  const { jobs } = (await r.json()) as { jobs: { id: string; mode: string; status: string }[] };
  return jobs.find((j) => j.mode === mode)!;
}
/** 指定モードの最新ジョブが終わるまで API を待つ（画面は最新の結果だけを大きく出すため、リンク数では数えない） */
async function waitForJob(page: Page, mode: string, timeout: number) {
  const t0 = Date.now();
  for (;;) {
    const j = await latestJob(page, mode);
    if (j && (j.status === "succeeded" || j.status === "failed")) return j;
    if (Date.now() - t0 > timeout) throw new Error(`job ${mode} did not finish in ${timeout}ms`);
    await page.waitForTimeout(3000);
  }
}
async function jobDetail(page: Page, id: string) {
  return ((await (await page.request.get(`/api/v1/studio/jobs/${id}`)).json()) as { job: Record<string, unknown> }).job;
}
async function material(page: Page, versionId: string) {
  return (await page.request.get(`/api/v1/studio/materials/${versionId}`)).json();
}

test("実 API: B 方式・C 方式の生成から患者の学習まで", async ({ browser }) => {
  test.setTimeout(REAL ? 1_800_000 : 300_000);
  const stamp = Date.now().toString().slice(-5);
  const editor = await newPage(browser, VIEWPORTS.ipadLandscape);
  const e = editor.page;
  await demoLogin(e, "staff", "田中 恵");
  await e.goto("/staff/studio");
  if (REAL) await expect(e.getByText(/擬似生成モード/)).toHaveCount(0);

  // A. 原資料の登録（架空の詳細版資料）
  await openRegisterForm(e);
  await e.getByLabel("原資料ファイル").setInputFiles("tests/fixtures/sources/hormone_therapy_detailed_demo.docx");
  await e.getByLabel("資料名").fill(`乳がんのホルモン療法を受ける方へ（架空・検証 ${stamp}）`);
  await e.getByLabel("許諾元（著作権者・作成部署）").fill("あおば記念病院（架空）乳腺センター・薬剤部");
  await e.getByLabel("許諾の根拠・確認内容").fill("ハッカソン検証用に作成したオリジナル資料（架空）。AI 処理・改変・院内公開を許可。患者情報なし。");
  for (const l of ["AI（Claude）で処理してよい", "改変・要約した教材を作ってよい", "患者向けに Web 公開してよい"]) await e.getByLabel(l).check();
  await e.getByLabel(/患者さんの個人情報.*含まないことを確認しました/).check();
  await e.getByRole("button", { name: "登録する" }).click();
  await e.getByRole("link", { name: "原資料の画面へ" }).click();
  await e.waitForURL(/\/staff\/studio\/sources\//);
  await expect(e.getByText(/Claude に送信できます/)).toBeVisible();
  const sourceUrl = e.url();
  const sourceId = sourceUrl.split("/").pop()!;
  save("source", await (await e.request.get(`/api/v1/studio/sources/${sourceId}`)).json());
  await shot(e, "d5_01_source");

  // B 方式: 構成案 → 選択 → 必須事項の確認（GEN-05: 候補は Claude、分類は医療者）→ 生成
  await e.getByRole("button", { name: "構成案を作る" }).click();
  await expect(e.getByRole("button", { name: "この案で進む" }).first()).toBeVisible({ timeout: JOB_WAIT });
  const outlineJob = await jobDetail(e, (await latestJob(e, "outline")).id);
  save("b_outline_job", outlineJob);
  await shot(e, "d5_02_b_outlines");
  // 案 2（副作用と連絡してほしい症状）があればそれを選ぶ（GEN-01 の検証対象: 受診行動の欠落）。無ければ案 1
  const picks = e.getByRole("button", { name: "この案で進む" });
  await picks.nth(Math.min(1, (await picks.count()) - 1)).click();
  await expect(e.getByText(/ステップ 3: 必須事項を確認/)).toBeVisible();
  // 医療者の分類: 候補は既定「この教材で必須」のまま。最後の 1 件だけ「医療者の確認が必要」にして分類の通しを確認
  const groups = e.getByRole("radiogroup");
  const nItems = await groups.count();
  if (nItems > 1) await groups.nth(nItems - 1).getByRole("radio", { name: "医療者の確認が必要" }).click();
  await shot(e, "d6_02b_must_cover_step");
  await e.getByRole("button", { name: /件を含めて教材・クイズを生成する/ }).click();
  await waitForJob(e, "generate", JOB_WAIT);
  await expect(e.getByRole("link", { name: /下書きを確認・編集する/ })).toHaveCount(1, { timeout: 30_000 });
  const bJob = await jobDetail(e, (await latestJob(e, "generate")).id);
  expect(bJob.status).toBe("succeeded");
  if (REAL) expect(bJob.generator).toBe("claude");
  save("b_generate_job", bJob);

  // C 方式: テーマ・学習目標を指定
  await e.getByLabel("テーマ").fill("治療中に気をつけたい体の変化と、病院へ連絡する目安");
  await e.getByLabel("対象（任意）").fill("術後にホルモン療法を始める方");
  await e.getByLabel(/学習目標/).fill("すぐに連絡が必要な症状を知る\n副作用は相談してよいと知る");
  await e.getByRole("button", { name: "この内容で下書きを作る" }).click();
  await expect(e.getByText(/ステップ 3: 必須事項を確認/)).toBeVisible();
  await e.getByRole("button", { name: /件を含めて教材・クイズを生成する/ }).click();
  await waitForJob(e, "freeform", JOB_WAIT);
  await expect(e.getByText("下書き作成（テーマ指定）").first()).toBeVisible({ timeout: 30_000 });
  const cJob = await jobDetail(e, (await latestJob(e, "freeform")).id);
  expect(cJob.status).toBe("succeeded");
  if (REAL) expect(cJob.generator).toBe("claude");
  save("c_freeform_job", cJob);
  await shot(e, "d5_03_jobs_done");

  // 編集（医療者）: B はタイトルに院内版の表記を加える。医学的内容は変えない
  const bVersion = bJob.outputVersionId as string;
  const cVersion = cJob.outputVersionId as string;
  save("b_material_generated", await material(e, bVersion));
  save("c_material_generated", await material(e, cVersion));
  await e.goto(`/staff/studio/materials/${bVersion}`);
  await expect(e.getByRole("heading", { name: "原資料と比較" })).toBeVisible();
  await shot(e, "d5_04_b_editor");
  const title = e.getByLabel("タイトル");
  await title.fill(`${await title.inputValue()}（院内版 ${stamp}）`);
  await e.getByRole("button", { name: "下書きを保存" }).click();
  await expect(e.getByText("保存しました")).toBeVisible();
  await e.getByRole("button", { name: "承認を依頼する" }).click();
  await expect(e.getByText("承認依頼を出しました")).toBeVisible();
  await e.goto(`/staff/studio/materials/${cVersion}`);
  await expect(e.getByRole("heading", { name: "原資料と比較" })).toBeVisible();
  await shot(e, "d5_05_c_editor");
  const cTitle = e.getByLabel("タイトル");
  await cTitle.fill(`${await cTitle.inputValue()}（院内版 ${stamp}）`);
  await e.getByRole("button", { name: "下書きを保存" }).click();
  await expect(e.getByText("保存しました")).toBeVisible();
  await e.getByRole("button", { name: "承認を依頼する" }).click();
  await expect(e.getByText("承認依頼を出しました")).toBeVisible();
  // 編集者は承認できない
  await expect(e.getByRole("button", { name: "承認して公開する" })).toHaveCount(0);

  // 承認（別の承認者）
  const approver = await newPage(browser, VIEWPORTS.ipadLandscape);
  const a = approver.page;
  await demoLogin(a, "staff", "佐藤 一郎");
  for (const [v, name] of [
    [bVersion, "b"],
    [cVersion, "c"],
  ] as const) {
    await a.goto(`/staff/studio/materials/${v}`);
    await expect(a.getByTestId("precheck")).toBeVisible();
    await shot(a, `d5_06_${name}_review`);
    save(`${name}_precheck_before`, (await material(a, v)).preCheck);
    // 承認者が必須事項を本文と照合して「確認済み」にする（安全上の重要事項が未確認だと承認ボタンは了承チェックが必要になる）
    const confirmBtn = a.getByRole("button", { name: "本文と照合して確認済みにする" });
    while ((await confirmBtn.count()) > 0) {
      await confirmBtn.first().click();
      await a.waitForTimeout(400);
    }
    await shot(a, `d6_06_${name}_precheck_confirmed`, false);
    save(`${name}_precheck_after`, (await material(a, v)).preCheck);
    await expect(a.getByRole("button", { name: "承認して公開する" })).toBeEnabled();
    await a.getByRole("button", { name: "承認して公開する" }).click();
    await expect(a.getByText(/公開中です/)).toBeVisible();
    await shot(a, `d5_07_${name}_published`, false);
    save(`${name}_material_published`, await material(a, v));
  }

  // 処方 → 患者の学習・確認問題
  const patient = await newPage(browser, VIEWPORTS.phone390);
  const p = patient.page;
  await demoLogin(p, "patient", "鈴木 美咲");
  const code = await showQrCode(p);
  await a.goto("/staff");
  await a.getByRole("button", { name: /患者さんの QR を読み取る/ }).click();
  await a.getByLabel("6桁の番号").fill(code);
  await a.getByRole("button", { name: /共有を要求する/ }).click();
  await p.getByRole("button", { name: "許可する" }).click();
  await a.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });
  await a.getByRole("button", { name: "開く" }).click();
  await a.getByRole("button", { name: "検索" }).click();
  await a.getByLabel("キーワード検索").fill(`院内版 ${stamp}`);
  await a.getByRole("button", { name: "追加", exact: true }).first().click();
  await a.getByRole("button", { name: "追加", exact: true }).first().click();
  await shot(a, "d5_08_prescribe");
  await a.getByRole("button", { name: /処方を確定する/ }).click();
  await expect(a.getByText(/2 件を処方しました|件を処方しました/)).toBeVisible();

  await p.goto("/home");
  await p.getByRole("link", { name: new RegExp(`院内版 ${stamp}`) }).first().click();
  await p.waitForURL(/\/learn\//);
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(p, "d5_09_patient_learn_1");
  let n = 1;
  while (!(await p.getByRole("button", { name: /確認問題へ/ }).isVisible())) {
    await p.getByRole("button", { name: /次のページへ|^次へ/ }).click();
    await shot(p, `d5_09_patient_learn_${++n}`);
  }
  await p.getByRole("button", { name: /確認問題へ/ }).click();
  await p.waitForURL(/\/quiz\//);
  await shot(p, "d5_10_patient_quiz_q1");
  for (let i = 0; i < 6; i++) {
    if (await p.getByText(/確認を終えました/).isVisible()) break;
    await p.getByRole("button", { name: /^ア/ }).click();
    await shot(p, `d5_10_patient_quiz_feedback_${i + 1}`);
    await p.getByRole("button", { name: /次の問題へ|結果を見る/ }).click();
  }
  await expect(p.getByText(/確認を終えました/)).toBeVisible();
  await shot(p, "d5_11_patient_quiz_result");
  save("meta", { real: REAL, stamp, finishedAt: new Date().toISOString(), screenshots: SHOT });
  for (const c of [editor, approver, patient]) await c.ctx.close();
});
