#!/usr/bin/env node
/**
 * 実 API 検証の書き出し（tests/e2e/real_generation.spec.ts）から、医師が原資料と照合するための報告書を作る。
 *   node scripts/render-generation-report.mjs docs/day5/real_generation/run_XXXX
 * 自動チェックは「確認候補を挙げる」だけで、医学的な正確性は判定しない。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: render-generation-report.mjs <run dir>");
  process.exit(2);
}
const load = (n) => (existsSync(`${dir}/${n}.json`) ? JSON.parse(readFileSync(`${dir}/${n}.json`, "utf8")) : null);
const src = load("source");
const outlineJob = load("b_outline_job");
const jobs = { B: load("b_generate_job"), C: load("c_freeform_job") };
const published = { B: load("b_material_published"), C: load("c_material_published") };

// 料金（USD / 100 万トークン）。2026-11 時点の公開価格。モデルが変わったら更新する
const PRICE = { "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20], "claude-fable-5-1": [10, 50] };
const norm = (s) => (s ?? "").replace(/\s+/g, "").replace(/[「」『』]/g, "");
const esc = (s) => String(s ?? "").replace(/\|/g, "｜").replace(/\n/g, " ");

const text = src.source.extractedText;
const paras = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
const paraOf = (quote) => {
  const q = norm(quote);
  if (!q) return null;
  const i = paras.findIndex((p) => norm(p).includes(q));
  return i >= 0 ? i + 1 : null;
};

const out = [];
const w = (s = "") => out.push(s);
const allReal = [jobs.B, jobs.C, outlineJob].filter(Boolean).every((j) => j.generator === "claude");
w(allReal ? `# 実 API（Claude）生成の検証記録` : `# 【注意】擬似生成・モックを含む記録（Claude による生成ではない）`);
w();
w(`- 生成元: ${[jobs.B, jobs.C, outlineJob].filter(Boolean).map((j) => `${j.mode}=${j.generator}（${j.model}）`).join(" / ")}`);
w(`- 自動チェックは確認候補の抽出のみ。医学的な正確性は医師が原資料と照合して判断する。`);
w();
w(`## 1. 使用した架空の原資料`);
w();
w(`- 資料名: ${src.source.title}`);
w(`- 許諾: AI 処理 ${src.permission.allowAi ? "可" : "不可"} / 改変 ${src.permission.allowDerive ? "可" : "不可"} / Web 公開 ${src.permission.allowPublish ? "可" : "不可"} / 他施設共有 ${src.permission.allowShare ? "可" : "不可"}、許諾元 ${src.permission.rightsHolder}`);
w(`- 抽出 ${text.length} 文字、${paras.length} 段落。以下の段落番号（¶）で対応表と照合できる。`);
w();
paras.forEach((p, i) => w(`- ¶${i + 1} ${p}`));
w();

w(`## 2. Claude が提案した教材構成（B 方式）`);
w();
if (outlineJob?.outputPayload) {
  outlineJob.outputPayload.outlines.forEach((o, i) => {
    w(`### 案 ${i + 1}: ${o.title}${i === (load("b_generate_job")?.inputPayload?.outlineIndex ?? 0) ? "（選択）" : ""}`);
    w(`- 対象: ${o.targetReader} / 領域: ${o.primaryDomain}`);
    w(`- 学習目標: ${o.learningObjectives.join(" / ")}`);
    w(`- 画面構成: ${o.slideTitles.join(" → ")}`);
    w(`- 根拠: ${o.rationale}`);
    w();
  });
  if (outlineJob.outputPayload.notCoveredBySource?.length) w(`- 原資料に記載なしとして扱わなかった内容: ${outlineJob.outputPayload.notCoveredBySource.join(" / ")}`);
  w();
}

const allCited = new Set();
for (const key of ["B", "C"]) {
  const job = jobs[key];
  if (!job) continue;
  const g = job.outputPayload;
  const label = key === "B" ? "B 方式（構成案から生成）" : `C 方式（テーマ: ${job.inputPayload.theme}）`;
  w(`## 3-${key}. 生成された教材全文: ${label}`);
  w();
  w(`- タイトル: ${g.title}`);
  w(`- 概要: ${g.summary}`);
  w(`- 領域: ${g.primaryDomain} / 学習目標: ${g.learningObjectives.join(" / ")}`);
  if (g.notCoveredBySource?.length) w(`- Claude が「原資料に記載なし」とした内容: ${g.notCoveredBySource.join(" / ")}`);
  if (g.validationWarnings?.length) w(`- 自動検証の警告: ${g.validationWarnings.join(" / ")}`);
  const pub = published[key];
  if (pub) w(`- 医療者の編集: タイトルを「${pub.material.title}」に変更（本文・問題は生成のまま）。承認 ${pub.version.approvedByUserId ? "編集者と別の承認者が実施" : "—"}、状態 ${pub.version.status}`);
  w();
  g.slides.forEach((s, i) => {
    w(`### 画面 ${i + 1}: ${s.title}`);
    w(`**要点**: ${s.proposition}`);
    w();
    w(s.body);
    if (s.detail) {
      w();
      w(`（くわしく）${s.detail}`);
    }
    w();
  });
  w(`### 確認問題（「わからない」はアプリが追加）`);
  g.questions.forEach((q, i) => {
    w();
    w(`**問 ${i + 1}.** ${q.stem}`);
    q.options.forEach((o, k) => w(`- ${"アイウ"[k]}. ${o}${k === q.correctIndex ? " ← 正答" : ""}`));
    w(`- 解説: ${q.explanation}`);
    w(`- 関連画面: ${q.relatedSlide}`);
  });
  w();

  w(`## 4-${key}. 原資料との対応表`);
  w();
  w(`| 箇所 | 出典の引用 | 原資料 | 見出し |`);
  w(`|---|---|---|---|`);
  const rows = [...g.slides.flatMap((s, i) => s.sourceRefs.map((r) => [`画面${i + 1}`, r])), ...g.questions.flatMap((q, i) => q.sourceRefs.map((r) => [`問${i + 1}`, r]))];
  for (const [where, r] of rows) {
    const p = paraOf(r.quote);
    if (p) allCited.add(p);
    w(`| ${where} | ${esc(r.quote)} | ${p ? `¶${p}` : "**見つからない**"} | ${esc(r.section)} |`);
  }
  w();

  // 原資料にない数値・カタカナ語（追加情報の候補）
  const genText = [g.title, g.summary, ...g.slides.flatMap((s) => [s.title, s.proposition, s.body, s.detail]), ...g.questions.flatMap((q) => [q.stem, ...q.options, q.explanation])].join("\n");
  const nums = [...new Set(genText.match(/[0-9０-９]+(?:[.．][0-9]+)?\s*(?:年|か月|ヶ月|週|日|回|%|％|mg|錠|割|人)/g) ?? [])];
  const kata = [...new Set(genText.match(/[ァ-ヴー]{3,}/g) ?? [])];
  const srcN = norm(text);
  const extraNums = nums.filter((x) => !srcN.includes(norm(x)));
  const extraKata = kata.filter((x) => !srcN.includes(x));
  w(`**追加情報の候補（原資料に同じ表記がない語）**: 数値 ${extraNums.length ? extraNums.join("、") : "なし"} ／ カタカナ語 ${extraKata.length ? extraKata.join("、") : "なし"}`);
  w();
  const lens = g.slides.map((s) => (s.body ?? "").length);
  w(`**文章量**: 画面ごとの本文 ${lens.join(" / ")} 文字（平均 ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}）`);
  w();
}

// GEN-05: 必須事項と本文の対応（医療者の分類・確認を含む）
w(`## 4-必須事項. Must-cover items と本文の対応（GEN-05）`);
w();
w(`機械照合は「項目の引用が教材の出典引用と重なるか」だけを見る参考情報。網羅と医学的妥当性の最終判断は医療者（confirmed）。`);
w();
for (const key of ["B", "C"]) {
  const pub = published[key];
  const items = pub?.version?.mustCover ?? [];
  const before = load(`${key.toLowerCase()}_precheck_before`);
  const after = load(`${key.toLowerCase()}_precheck_after`);
  w(`### ${key} 方式: ${items.length} 件${before ? `（承認前の未確認: 安全上 ${before.mustCover?.safetyUnconfirmed?.length ?? 0} 件 → 確認後 ${after?.mustCover?.safetyUnconfirmed?.length ?? "—"} 件）` : ""}`);
  if (!items.length) {
    w(`- なし（必須事項なしで生成）`);
    w();
    continue;
  }
  w();
  w(`| # | 種別 | 分類 | 必須事項 | 原資料 | Claude の申告 | 機械照合 | 医療者の確認 |`);
  w(`|---|---|---|---|---|---|---|---|`);
  items.forEach((i, n) => {
    const p = paraOf(i.sourceRef?.quote);
    const cov = [i.coverage?.slides?.length ? `画面 ${i.coverage.slides.join(",")}` : "", i.coverage?.questions?.length ? `問 ${i.coverage.questions.join(",")}` : ""].filter(Boolean).join(" ") || "対応なし";
    w(`| ${n + 1} | ${i.kind} | ${i.status} | ${esc(i.text)} | ${p ? `¶${p}` : "—"} | ${cov} | ${i.autoMatched === true ? "引用あり" : i.autoMatched === false ? "引用なし" : "—"} | ${i.confirmed ? `済（${esc(i.confirmed.byName)}）` : "未"} |`);
  });
  w();
}

// GEN-01〜03 の観点（機械的な観察。医学的判断は医師）
w(`## 4-GEN. GEN-01〜03 の観察（機械的な集計。判断は医師）`);
w();
const ACTION_RE = /(連絡|受診|救急|相談|やめ|中止|減ら)/;
for (const key of ["B", "C"]) {
  const g = jobs[key]?.outputPayload;
  if (!g) continue;
  const actionParas = paras.map((p, i) => [i + 1, p]).filter(([, p]) => /(連絡してください|受診してください|次の診察を待たずに|やめたり|中止)/.test(p));
  const citedAction = actionParas.filter(([n]) => [...g.slides.flatMap((s) => s.sourceRefs), ...g.questions.flatMap((q) => q.sourceRefs)].some((r) => paraOf(r.quote) === n));
  const situational = g.questions.filter((q) => /(とき|場合|どうし|どのように)/.test(q.stem));
  const obviousDistractors = g.questions.flatMap((q) => q.options.filter((o, k) => k !== q.correctIndex && /(必ず|全員|絶対|誰にも|放置|気にしない|黙って)/.test(o)));
  const sectionMix = (g.validationWarnings ?? []).filter((w) => /複数の見出し/.test(w));
  const unsafeExplained = g.questions.filter((q) => q.options.some((o, k) => k !== q.correctIndex && ACTION_RE.test(o)) && /(相談|連絡|受診|担当医|薬剤師)/.test(q.explanation)).length;
  w(`### ${key} 方式`);
  w(`- GEN-01 受診・連絡・禁止の行動が書かれた原資料段落 ${actionParas.length} 件のうち、教材で引用されたもの ${citedAction.length} 件${actionParas.length ? `（未引用: ${actionParas.filter(([n]) => !citedAction.some(([m]) => m === n)).map(([n]) => `¶${n}`).join(", ") || "なし"}）` : ""}`);
  w(`- GEN-02 出典が複数の見出しにまたがる画面: ${sectionMix.length} 件${sectionMix.length ? `（${sectionMix.map(esc).join(" / ")}）` : ""}`);
  w(`- GEN-03 状況判断型の設問（「とき／場合／どうし」を含む）: ${situational.length} / ${g.questions.length} 問、明らかすぎる誤答の候補（必ず／全員／絶対 等）: ${obviousDistractors.length} 件${obviousDistractors.length ? `（${obviousDistractors.map(esc).join(" / ")}）` : ""}、行動を含む誤答に解説で正しい対応が示された設問: ${unsafeExplained} 問`);
  w();
}

w(`## 4-共通. 引用されなかった原資料の段落（重要情報の欠落の確認候補）`);
w();
const uncited = paras.map((p, i) => [i + 1, p]).filter(([n]) => !allCited.has(n));
uncited.forEach(([n, p]) => w(`- ¶${n} ${p.slice(0, 80)}${p.length > 80 ? "…" : ""}`));
if (!uncited.length) w("- なし");
w();

w(`## 5. 生成時間・使用トークン・API 使用量`);
w();
w(`| ジョブ | 生成元 | モデル | 処理時間 | 入力 | 出力 | キャッシュ読取 | 概算費用 | 試行 | request-id |`);
w(`|---|---|---|---|---|---|---|---|---|---|`);
let total = 0;
for (const [name, j] of [["構成案（B）", outlineJob], ["教材（B）", jobs.B], ["教材（C）", jobs.C]]) {
  if (!j) continue;
  const base = Object.keys(PRICE).find((m) => (j.model ?? "").startsWith(m));
  const cost = j.generator === "claude" && base ? ((j.inputTokenCount ?? 0) * PRICE[base][0] + (j.outputTokenCount ?? 0) * PRICE[base][1]) / 1e6 : 0;
  total += cost;
  const wall = j.startedAt && j.finishedAt ? ((new Date(j.finishedAt) - new Date(j.startedAt)) / 1000).toFixed(1) : "—";
  w(`| ${name} | ${j.generator} | ${j.model}${j.fallbackUsed ? "（fallback）" : ""} | API ${((j.durationMs ?? 0) / 1000).toFixed(1)} 秒 / 全体 ${wall} 秒 | ${j.inputTokenCount ?? "—"} | ${j.outputTokenCount ?? "—"} | ${j.cacheReadTokenCount ?? 0} | $${cost.toFixed(4)} | ${j.attempt} | ${j.requestId ?? "—"} |`);
}
w();
w(`合計の概算費用: **$${total.toFixed(4)}**（出力トークンには思考トークンを含む。価格は表内の単価で換算）`);
w();
w(`## 7. 医師による確認欄`);
w();
w(`- [ ] 原文との整合性（各画面・各問を対応表の ¶ と照合）`);
w(`- [ ] 重要情報の欠落（4-共通の未引用段落を確認）`);
w(`- [ ] 原資料にない情報の追加（追加情報の候補を確認）`);
w(`- [ ] 画面分割の適切さ / 患者向け文章 / クイズの正答・解説`);
writeFileSync(`${dir}/REPORT.md`, out.join("\n") + "\n");
console.log(`wrote ${dir}/REPORT.md`);
