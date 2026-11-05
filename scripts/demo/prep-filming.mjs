#!/usr/bin/env node
/**
 * 撮影の事前準備: 伊藤 涼子（架空）に、診察で「初回診断時セット」を処方した状態を作る。Claude は呼ばない。
 *   BASE=http://localhost:3900 node scripts/demo/prep-filming.mjs
 * 固定データで処方済みに見せかけず、本番と同じ手順（患者が 6 桁コードを発行 → 医療者が読み取り → 患者が承認 →
 * 医療者が処方 → 共有終了）を API で行う。佐藤 花子のデータには触れない（記録済みの Claude 出力の再生を保つ）。
 * 撮影用サーバー（scripts/review/serve.sh・新しい一時 DB）の起動直後に 1 回だけ実行する。
 */
import { chromium } from "playwright";

export const SET_TITLES = ["乳がんの診断と病期の考え方", "サブタイプと治療方針のつながり", "こころのケアと相談先"];

async function loginContext(browser, base, kind, name) {
  const ctx = await browser.newContext({ baseURL: base, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const page = await ctx.newPage();
  await page.goto(base + (kind === "patient" ? "/login" : "/staff/login"));
  await page.getByRole("button", { name: new RegExp(name) }).first().click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 });
  return { ctx, page };
}

async function call(page, method, path, data) {
  const r = await page.request.fetch(path, { method, data, headers: data ? { "content-type": "application/json" } : undefined });
  const body = await r.json().catch(() => ({}));
  if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${JSON.stringify(body).slice(0, 200)}`);
  return body.data ?? body;
}

/** 伊藤 涼子に初回診断時セットを処方する（すでに処方済みなら何もしない） */
export async function prepIto(browser, base) {
  const accounts = await (await fetch(base + "/api/v1/demo/accounts")).json();
  if (!accounts.accounts.every((a) => a.email.endsWith("@example.com"))) throw new Error("架空以外のアカウントがあるため中止");
  const patient = await loginContext(browser, base, "patient", "伊藤 涼子");
  const staff = await loginContext(browser, base, "staff", "佐藤 一郎");
  try {
    const lib = await call(patient.page, "GET", "/api/v1/library");
    if ((lib.latestSetTemplates ?? []).some((t) => t.name === "初回診断時セット")) return { skipped: true };
    const grant = await call(patient.page, "POST", "/api/v1/qr");
    const me = await call(staff.page, "GET", "/api/v1/me");
    const org = me.memberships.find((m) => /さくら/.test(m.orgName ?? m.name ?? "")) ?? me.memberships[0];
    await call(staff.page, "POST", "/api/v1/qr/claim", { orgId: org.orgId ?? org.id, code: grant.code });
    const { consultationSessionId: sid } = await call(patient.page, "POST", `/api/v1/qr/${grant.grantId}/approve`);
    const { items } = await call(staff.page, "GET", `/api/v1/consultations/${sid}/materials`);
    const ids = SET_TITLES.map((t) => items.find((m) => m.title === t)?.id ?? items.find((m) => m.title === t)?.materialId);
    if (ids.some((x) => !x)) throw new Error("初回診断時セットの教材が見つかりません");
    await call(staff.page, "POST", `/api/v1/consultations/${sid}/prescriptions`, { materialIds: ids });
    await call(staff.page, "POST", `/api/v1/consultations/${sid}/end`);
    return { skipped: false, sessionId: sid };
  } finally {
    await patient.ctx.close();
    await staff.ctx.close();
  }
}

if (process.argv[1]?.endsWith("prep-filming.mjs")) {
  const base = process.env.BASE ?? "http://localhost:3900";
  const browser = await chromium.launch();
  try {
    const r = await prepIto(browser, base);
    console.log(r.skipped ? "伊藤 涼子: 初回診断時セットは処方済み（何もしませんでした）" : "伊藤 涼子: 初回診断時セットを処方し、共有を終了しました");
  } finally {
    await browser.close();
  }
}
