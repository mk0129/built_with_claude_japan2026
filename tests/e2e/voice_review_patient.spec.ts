import { test, type Page } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * 音声レビュー対応（患者側・架空データ）。
 * 1. ホーム（390px）: 上から「次の診察」→「体調を記録」「次の診察で聞きたいこと」→「医療者から届いた教材」。
 *    直近 2 件と作成日・「ほか N 件」・「すべて見る」。「自分で教材を探す」はホームに重ねない。文字 150% でも横にはみ出さない
 * 2. 表記: 入手経路（医療者から届いた／自分で読める）と学習状態を別の言葉で示す。絞り込みの意味を説明する
 * 3. 理解確認: 誤答は「この答えは正しくありません」「正しくは…」。「次の診察で聞く」→「質問を保存しました」→ 同じ設問・解説・スクロール位置へ戻る
 * 4. 音声: 「読み上げ中」は実際の開始（start）から終了（end）まで。使えないときは理由を表示（端末の読み上げは差し替えて確認。可聴性は確認できない）
 * 高橋 由美（架空）を使い、作った質問は最後に削除する。
 */

async function notesApi(p: Page) {
  return (await (await p.request.get("/api/v1/notes")).json()).notes as { id: string; body: string }[];
}

/** 文字だけを 1.5 倍にする（ページの拡大ではなく、文字サイズの設定を大きくした状態に近い） */
async function textZoom(p: Page, factor: number) {
  await p.evaluate((f) => {
    const els = [...document.querySelectorAll<HTMLElement>(".d-device *")];
    const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    els.forEach((e, i) => (e.style.fontSize = `${sizes[i] * f}px`));
  }, factor);
}

test("患者ホーム（390px・文字150%）: 次の診察 → 体調 → 聞きたいこと（直近2件・ほかN件） → 届いた教材。表記と絞り込み", async ({ browser }) => {
  const { ctx, page: p } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(p, "patient", "高橋 由美");
  const bodies = ["（E2E）質問その1", "（E2E）質問その2", "（E2E）質問その3"];
  for (const body of bodies) await p.request.post("/api/v1/notes", { data: { body } });
  const total = (await notesApi(p)).length;
  await p.goto("/home");
  await expect(p.locator(".d-home-ask-list li")).toHaveCount(2);

  // 並び順（上から）
  const order = await p.evaluate(() => {
    const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return { visit: y(".d-visit-card"), health: y("[data-home-health]"), ask: y(".d-home-ask"), rx: y(".d-home-rx") };
  });
  expect(order.visit).toBeGreaterThan(0);
  expect(order.health).toBeGreaterThan(order.visit);
  expect(order.ask).toBeGreaterThan(order.health);
  expect(order.rx).toBeGreaterThan(order.ask);
  // 体調を記録・聞きたいことの入力は初期表示で見える
  await expect(p.locator("[data-home-health]")).toBeInViewport();
  await expect(p.locator("[data-home-note-input]")).toBeInViewport();
  await expect(p.locator(".d-home-rx h2")).toHaveText("医療者から届いた教材");
  await expect(p.locator(".d-quick-categories")).toHaveCount(0);

  // 聞きたいこと: 新しい順の直近 2 件と作成日、ほか N 件、すべて見る
  await expect(p.locator(".d-home-ask h2")).toHaveText("次の診察で聞きたいこと");
  await expect(p.locator(".d-home-ask-list li").first()).toContainText(bodies[2]);
  await expect(p.locator(".d-home-ask-list li").first()).toContainText(/\d+月\d+日に保存/);
  await expect(p.locator("[data-home-note-more]")).toHaveText(`ほか${total - 2}件`);
  // 体調を記録 → 入力画面へ直接
  await p.locator("[data-home-health]").click();
  await expect(p.getByRole("button", { name: "この記録を保存" })).toBeVisible();
  await p.locator(".d-nav").getByRole("button", { name: "ホーム" }).click();
  await p.locator("[data-home-note-all]").click();
  await expect(p.locator(".d-notes h1")).toHaveText("次の診察で聞きたいこと");
  await expect(p.locator(".d-nav button.active")).toContainText("聞きたいこと");

  // 文字 150%: 横にはみ出さない
  await p.locator(".d-nav").getByRole("button", { name: "ホーム" }).click();
  await expect(p.locator(".d-home-rx")).toBeVisible();
  await textZoom(p, 1.5);
  const outside = await p.evaluate(() =>
    [...document.querySelectorAll(".d-home *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      })
      .map((e) => (e.textContent ?? "").trim().slice(0, 20)),
  );
  expect(outside).toEqual([]);
  expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  // 教材を探す: 入手経路の絞り込みと説明。カードは入手経路と学習状態を別に表示
  await p.reload();
  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  const filters = p.getByRole("group", { name: "入手経路で絞り込む" });
  await expect(filters.getByRole("button")).toHaveText(["すべて", "医療者から届いた教材", "自分で読める教材"]);
  await expect(p.locator("[data-filter-help]")).toContainText("医療者から届いていない公開教材");
  await filters.getByRole("button", { name: "自分で読める教材" }).click();
  const cards = p.locator(".d-all-lessons .d-lesson-card");
  await expect(cards.first()).toBeVisible();
  await expect(cards.locator("[data-source]").first()).toHaveText("自分で読める");
  await expect(p.locator(".d-all-lessons")).not.toContainText("自主");

  for (const n of (await notesApi(p)).filter((x) => bodies.includes(x.body))) await p.request.delete(`/api/v1/notes/${n.id}`);
  await ctx.close();
});

test("理解確認: 誤答の表示 →「次の診察で聞く」→「質問を保存しました」→ 同じ設問・解説・スクロール位置へ戻る", async ({ browser }) => {
  // 低い画面（解説がスクロールする）
  const { ctx, page: p } = await newPage(browser, { width: 390, height: 560 });
  await demoLogin(p, "patient", "高橋 由美");
  const before = (await notesApi(p)).map((n) => n.id);
  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  await p.locator(".d-category-cards button").filter({ hasText: "放射線療法" }).click();
  await p.locator(".d-lesson-card").first().click();
  await p.locator(".d-detail .d-bottom-action").click();
  for (let i = 0; i < 10; i++) {
    const t = await p.locator(".d-learning-actions .primary-button").textContent();
    if (t?.includes("理解を確認する")) break;
    await p.getByRole("button", { name: "次へ" }).click();
  }
  await p.getByRole("button", { name: "理解を確認する" }).click();
  // 誤答になるまで選択肢を変えて回答（正解した設問は次へ）
  let wrong = false;
  for (let q = 0; q < 6 && !wrong; q++) {
    await expect(p.locator(".d-quiz h1")).not.toHaveText("読み込んでいます…");
    await p.locator(".d-answer-list button").nth(q % 3).click();
    await p.getByRole("button", { name: "この回答で確定する" }).click();
    const h = p.locator(".d-answer-result h1");
    await expect(h).not.toHaveText("");
    wrong = (await h.textContent())?.includes("この答えは正しくありません") ?? false;
    if (!wrong) {
      const next = p.getByRole("button", { name: /次の問題へ|振り返りへ/ });
      if ((await next.textContent())?.includes("振り返りへ")) break;
      await next.click();
    }
  }
  expect(wrong, "誤答の設問がある").toBeTruthy();
  await expect(p.locator("[data-correct-answer]")).toContainText(/正しくは「.+」です。/);
  await expect(p.locator(".d-explanation-copy")).toContainText("理由（解説）");
  const stem = new URL(p.url()).searchParams.get("q");
  const ask = p.getByRole("button", { name: "次の診察で聞く（質問に残す）" });
  await ask.scrollIntoViewIfNeeded();
  const scrollOf = () => p.evaluate(() => Math.max(window.scrollY, document.querySelector(".d-main")?.scrollTop ?? 0));
  const leftAt = await scrollOf();
  expect(leftAt).toBeGreaterThan(0);
  await ask.click();
  await expect(p.locator(".d-add-question textarea")).toHaveValue(/について、私の場合を教えてください/);
  await expect(p.locator("[data-quiz-return]")).toContainText("理解確認から来ました");
  await p.getByRole("button", { name: "質問を保存" }).click();
  const back = p.locator("[data-back-to-question]");
  await expect(p.locator("[data-quiz-return]")).toContainText("質問を保存しました");
  await expect(back).toBeInViewport();
  await back.click();
  await expect(p).toHaveURL(/view=explanation/);
  expect(new URL(p.url()).searchParams.get("q")).toBe(stem);
  await expect(p.locator(".d-answer-result h1")).toContainText("この答えは正しくありません");
  await expect.poll(scrollOf).toBeGreaterThan(leftAt - 5);
  expect(Math.abs((await scrollOf()) - leftAt)).toBeLessThanOrEqual(5);

  for (const n of (await notesApi(p)).filter((x) => !before.includes(x.id))) await p.request.delete(`/api/v1/notes/${n.id}`);
  await ctx.close();
});

/** 端末の読み上げを差し替える（headless では音が出たか確認できないため、イベントの順だけを確認する） */
async function fakeSpeech(p: Page, mode: "plays" | "silent" | "no-japanese") {
  await p.addInitScript((m) => {
    const fake = {
      speaking: false,
      getVoices: () => (m === "no-japanese" ? [{ lang: "en-US", name: "English" }] : m === "plays" ? [{ lang: "ja-JP", name: "日本語" }] : []),
      cancel() {},
      speak(u: SpeechSynthesisUtterance) {
        if (m !== "plays") return;
        setTimeout(() => u.onstart?.(new Event("start") as SpeechSynthesisEvent), 700);
        setTimeout(() => u.onend?.(new Event("end") as SpeechSynthesisEvent), 2200);
      },
    };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    // 日本語の音声を設定するときに型を確かめるため、voice の代入は許す
    const Orig = window.SpeechSynthesisUtterance;
    class U extends Orig {
      private _v: unknown = null;
      get voice() {
        return this._v as SpeechSynthesisVoice;
      }
      set voice(v: SpeechSynthesisVoice) {
        this._v = v;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: U, configurable: true });
  }, mode);
}

async function openFirstLesson(p: Page) {
  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  await p.locator(".d-category-cards button").filter({ hasText: "放射線療法" }).click();
  await p.locator(".d-lesson-card").first().click();
  await p.locator(".d-detail .d-bottom-action").click();
  await expect(p.locator(".d-learning h1")).not.toHaveText("読み込んでいます…");
}

test("音声: 「読み上げ中」は実際の開始〜終了だけ。始まらない・日本語の音声がないときは理由を表示", async ({ browser }) => {
  for (const mode of ["plays", "silent", "no-japanese"] as const) {
    const { ctx, page: p } = await newPage(browser, { width: 390, height: 844 });
    await fakeSpeech(p, mode);
    await demoLogin(p, "patient", "高橋 由美");
    await openFirstLesson(p);
    const state = p.locator("[data-audio-state]");
    await p.locator("[data-audio-toggle]").click();
    if (mode === "plays") {
      await expect(state).toHaveAttribute("data-audio-state", "starting");
      await expect(state).toHaveText(/読み上げ中/);
      await expect(p.locator("[data-audio-toggle]")).toHaveText(/停止/);
      await expect(state).toHaveCount(0, { timeout: 5_000 });
      await expect(p.locator("[data-audio-toggle]")).toHaveText(/音声/);
    } else if (mode === "silent") {
      await expect(state).toContainText("準備");
      await expect(state).toHaveAttribute("data-audio-state", "error", { timeout: 8_000 });
      await expect(state).toContainText("読み上げが始まりませんでした");
      await expect(state).not.toContainText("読み上げ中");
    } else {
      await expect(state).toHaveAttribute("data-audio-state", "error");
      await expect(state).toContainText("日本語の読み上げ音声が見つかりません");
    }
    await ctx.close();
  }
});
