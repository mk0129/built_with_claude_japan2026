#!/usr/bin/env node
/**
 * 医療費シミュレーターと診察サマリーの変更前後の画面（同じ架空データ・同じ表示位置・同じ倍率）。
 *   BASE : 隔離サーバー（新しい一時 DB。REVIEW_DIST=<dir> sh scripts/review/serve.sh <port> <dbPort>）。3900 には接続しない
 *   OUT  : 出力先フォルダ（例 docs/review/submission_ux/before）
 * スマートフォン 393×852（倍率 3）: 医療費の入力（手順 5・総医療費 100 万円を入力した状態）・結果（手入力で 92,940円）
 * iPad 1180×820（倍率 2）: 共有直後・要約の表示後・根拠を開いた状態（佐藤 花子。記録済みの Claude 出力の再生）
 * EXTRA=1: 手動確認用の追加の画面（架空の例・多数回該当が不明・対象外・詳細を開いた状態・ほかの質問・全項目）
 * Claude は呼ばない。患者の記録は変えない（共有と閲覧だけ。最後に共有を終える）。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const B = process.env.BASE ?? "http://localhost:3470";
if (/:3900\b/.test(B)) throw new Error("3900 の撮影環境には接続しません");
const OUT = process.env.OUT;
if (!OUT) throw new Error("OUT を指定してください");
mkdirSync(OUT, { recursive: true });
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) });

const browser = await chromium.launch({ args: ["--lang=ja-JP", "--hide-scrollbars"] });
async function session(kind, name, vp, dpr) {
  const ctx = await browser.newContext({ baseURL: B, viewport: vp, deviceScaleFactor: dpr, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "light", reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(kind === "patient" ? "/login" : "/staff/login");
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 });
  return p;
}
const settle = async (p, ms = 400) => {
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(ms);
};

// ---------- スマートフォン: 医療費シミュレーター（伊藤 涼子） ----------
{
  const p = await session("patient", "伊藤 涼子", { width: 393, height: 852 }, 3);
  await p.goto("/home?view=simulator");
  await p.locator("[data-sim]").waitFor();
  await settle(p);
  await shot(p, "phone_sim_01_start");
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='employee']").click();
  await p.locator("[data-sim-choice='bracket-c']").click();
  await p.locator("[data-sim-cost-input]").fill("1000000");
  await settle(p);
  await shot(p, "phone_sim_02_cost_input");
  await p.locator("[data-sim-calc]").click();
  await p.locator("[data-sim-amount]").waitFor();
  await settle(p);
  await shot(p, "phone_sim_03_result_1000000");
  if (process.env.EXTRA) {
    await p.locator("[data-sim-detail='breakdown'] summary").click();
    await settle(p, 200);
    await shot(p, "phone_sim_x1_result_breakdown_open");
    await p.getByRole("button", { name: "医療費を変えて計算する" }).click();
    await settle(p, 200);
    await shot(p, "phone_sim_x2_recalc_keeps_conditions");
    await p.getByRole("radio", { name: "わからない" }).click();
    await p.locator("[data-sim-calc]").click();
    await p.locator("[data-sim-amount]").waitFor();
    await settle(p, 200);
    await shot(p, "phone_sim_x3_many_times_unknown");
    await p.getByRole("button", { name: "最初から選び直す" }).click();
    await p.locator("[data-sim-demo]").click();
    await settle(p, 200);
    await shot(p, "phone_sim_x4_demo_example");
    await p.getByRole("button", { name: "最初から選び直す" }).click();
    await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
    await p.locator("[data-sim-choice='under70']").click();
    await p.locator("[data-sim-choice='employee']").click();
    await p.locator("[data-sim-choice='bracket-unknown']").click();
    await settle(p, 200);
    await shot(p, "phone_sim_x5_unsupported_bracket_unknown");
  }
  await p.context().close();
}

// ---------- iPad: 診察サマリー（佐藤 花子） ----------
{
  const hanako = await session("patient", "佐藤 花子", { width: 393, height: 852 }, 1);
  const staff = await session("staff", "佐藤 一郎", { width: 1180, height: 820 }, 2);
  const live = await (await staff.request.get("/api/v1/staff/live")).json();
  if (live.activeSessionId) throw new Error("共有が残っています（新しい一時 DB で実行）");
  await staff.goto("/staff");
  await hanako.goto("/home?view=share");
  await hanako.locator("[data-share-issue]").click();
  await hanako.locator("[data-share-code]").waitFor();
  const code = ((await hanako.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
  await staff.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力/ }).click();
  await staff.locator(".cd-code-panel input").fill(code);
  await staff.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await hanako.locator("[data-share-request]").waitFor({ timeout: 15_000 });
  await hanako.locator(".d-consent input").check();
  await hanako.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  // 共有直後: 診察サマリーの見出しが出た時点（要約の読み込み前を含む）
  await staff.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
  await staff.locator("[data-intervisit]").waitFor({ timeout: 15_000 });
  await staff.waitForTimeout(150);
  await shot(staff, "ipad_summary_01_just_shared");
  // 要約の表示後（記録済みの Claude 出力の再生）
  await staff.locator('[data-intervisit] [data-summary-kind=\"replay\"]').waitFor({ timeout: 30_000 });
  await settle(staff, 600);
  await shot(staff, "ipad_summary_02_loaded");
  // 根拠を開いた状態: 患者の質問（手のしびれ）の根拠
  const q = staff.locator("[data-intervisit]").locator("button").filter({ hasText: "手のしびれは、治療が終わったら戻りますか？" }).first();
  await q.scrollIntoViewIfNeeded();
  await q.click();
  await staff.locator("[data-summary-sources]").first().waitFor();
  await settle(staff, 300);
  await shot(staff, "ipad_summary_03_evidence_open");
  if (process.env.EXTRA && (await staff.locator('[data-row-more="questions"]').count())) {
    await q.click(); // 根拠を閉じる
    await staff.locator('[data-row-more="questions"]').click();
    await settle(staff, 200);
    await shot(staff, "ipad_summary_x1_more_questions");
    await staff.locator("[data-summary-all-toggle]").click();
    await staff.locator("[data-summary-all-toggle]").scrollIntoViewIfNeeded();
    await settle(staff, 200);
    await shot(staff, "ipad_summary_x2_all_items_open");
  }
  // 後片付け（共有を終える）
  const sid = (await (await staff.request.get("/api/v1/staff/live")).json()).activeSessionId;
  if (sid) await staff.request.post(`/api/v1/consultations/${sid}/end`, { data: {} });
}
await browser.close();
console.log("saved to", OUT);
