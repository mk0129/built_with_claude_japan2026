#!/usr/bin/env node
/**
 * 教材イラスト 57 点の検証表を作る（2026-11-08）。
 *   node scripts/review/illustration-verification-table.mjs --batch <validate-illustration-batch の --report JSON> --walk <illustration-walkthrough の walkthrough.json> --out <出力フォルダ>
 * 台帳（docs/design/illustration_batch_20261108/delivery_manifest.json）の 57 ID について、
 * 配信ファイルの照合（public/・審査用ビルド・公開 URL の SHA-256 と寸法）、公開 URL での画面データ（DOM: currentSrc・naturalWidth）の照合、
 * 代表スクリーンショットでの目視の別を 1 表にまとめ、verification_table.md と verification_table.csv を書く。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const batch = JSON.parse(readFileSync(opt("--batch"), "utf8"));
const walk = JSON.parse(readFileSync(opt("--walk"), "utf8"));
const out = opt("--out");
mkdirSync(out, { recursive: true });
const manifest = JSON.parse(readFileSync("docs/design/illustration_batch_20261108/delivery_manifest.json", "utf8"));

/** 代表スクリーンショットで目視した ID（公開版で撮った画像のファイル名 → 写っている ID） */
const VISUAL = {
  "P11_learn_p1_390.png": ["EDI-SE-01"],
  "P12_learn_p2_390.png": ["EDI-SE-02"],
  "P13_learn_p3_390.png": ["EDI-SE-03"],
  "P14_learn_p4_390.png": ["EDI-SE-04"],
  "P15_learn_p5_390.png": ["EDI-SE-05"],
  "P23_back_to_related_page_390.png": ["EDI-SE-05"],
  "P31_library_cards_390.png": ["THUMB-radiation", "THUMB-sakura_lymph", "THUMB-mouth_taste", "THUMB-neuropathy", "THUMB-appearance_care", "THUMB-fever_response", "THUMB-post_surgery_diet"],
  "P32_search_shibire_390.png": ["THUMB-neuropathy"],
  "P33_detail_neuropathy_390.png": ["THUMB-neuropathy"],
  "P40_set_detail_390.png": ["COVER-chemo_start_set", "THUMB-drug_therapy"],
  "C03_library_candidates_1024.png": ["THUMB-neuropathy"],
  "C04_library_sets_1024.png": ["COVER-chemo_start_set", "COVER-preop_set", "COVER-sakura_chemo_orientation", "COVER-immunotherapy_set", "COVER-side_effect_care_set", "COVER-prehab_set"],
  "C08_patient_detail_neuropathy_1024.png": ["THUMB-neuropathy"],
  "C09_patient_learn_neuropathy_1024.png": ["EDI-NEW-12"],
};
const visualOf = (id) => Object.entries(VISUAL).filter(([, ids]) => ids.includes(id)).map(([f]) => f);

const byName = (name) => walk.results.find((r) => r.name === name)?.detail ?? [];
const pages = byName("pages");
const sweep = byName("sweep");
const library = byName("library");
const clinicianLibrary = byName("clinicianLibrary");
const clinicianSets = byName("clinicianSets");
const delivered = walk.results.find((r) => r.name === "delivered");
const patientCover = walk.results.find((r) => /セット詳細「.+」の表紙/.test(r.name));
const batchRow = (id) => batch.rows.find((r) => r.id === id);

const mark = (v) => (v === "一致" ? "一致" : v === "—" || v == null ? "—" : v);
const rows = manifest.items.map((item) => {
  const b = batchRow(item.id);
  const files = b?.files ?? [];
  const fileCells = files.map((f) => `${path.basename(f.url)}: public ${mark(f.local)}／ビルド ${mark(f.dist)}／公開 ${mark(f.live)}`).join("<br>");
  const liveDetail = files.map((f) => f.liveDetail ?? "").filter(Boolean).join("<br>");
  let patient = "";
  let clinician = "";
  if (item.kind === "editorial") {
    const hit = pages.find((p) => p.id === item.id) ?? sweep.find((p) => p.id === item.id);
    patient = hit ? `${hit.ok ? "一致" : "不一致"}（${item.materialTitle} ${item.slideSeq} ページ、${hit.src ?? "—"} ${hit.natural ? hit.natural.join("×") : ""}）` : "未確認";
    clinician = item.id === delivered?.detail?.id ? `処方 → 同じタブの患者側で ${delivered.ok ? "一致" : "不一致"}` : "本来見えない（医療者のライブラリはサムネイルのみ）";
  } else if (item.kind === "thumbnail") {
    const hit = library.find((r) => r.id === item.id);
    const chit = clinicianLibrary.find((r) => r.id === item.id);
    patient = hit ? `${hit.ok ? "一致" : "不一致"}（教材一覧 ${hit.card?.src ?? "—"} ${hit.card?.natural ? hit.card.natural.join("×") : ""}）` : "未確認";
    clinician = chit ? `${chit.ok ? "一致" : "不一致"}（ライブラリ ${chit.hits?.length ?? 0} 行）` : "未確認";
  } else {
    const chit = clinicianSets.find((r) => r.id === item.id);
    clinician = chit ? `${chit.ok ? "一致" : "不一致"}（セット選択 ${chit.hit?.src ?? "—"} ${chit.hit?.natural ? chit.hit.natural.join("×") : ""}）` : "未確認";
    patient = patientCover && patientCover.detail?.setName === item.key ? `${patientCover.ok ? "一致" : "不一致"}（セット詳細の表紙）` : "本来見えない（架空患者に処方されていないセット。処方されれば同じ DSetCover に表示）";
  }
  const visuals = visualOf(item.id);
  const where = item.kind === "editorial" ? `${item.materialTitle}／${item.slideSeq} ページ「${item.slideTitle}」` : item.kind === "thumbnail" ? `${item.materialTitle}／教材サムネイル` : `${item.setName}／セット表紙`;
  const sha = files.length && files.every((f) => f.local === "一致" && (f.dist === "一致" || f.dist === "—") && (f.live === "一致" || f.live === "—")) ? "一致" : "要確認";
  const ok = sha === "一致" && !(b?.problems?.length) && !/不一致|未確認/.test(patient + clinician);
  return { id: item.id, kind: item.kind, where, alt: item.alt, urls: files.map((f) => f.url).join(" "), fileCells, sha, liveDetail, patient, clinician, visuals: visuals.length ? visuals.join(", ") : "—（DOM 照合のみ）", problems: (b?.problems ?? []).join(" / "), ok };
});

const kindJa = { editorial: "本文挿絵", thumbnail: "教材サムネイル", cover: "セット表紙" };
const md = [];
md.push(`# 教材イラスト 57 点の検証表（${new Date().toISOString().slice(0, 10)}）`, "");
md.push(`- 配信ファイルの照合: public/（納品物と SHA-256・寸法が一致）、審査用ビルド .judge-demo/dist、公開 URL ${batch.live ?? "—"}（配信中のコミット ${batch.liveCommit ?? "—"}。HTTP 200・image/* の応答・画像としてデコード・寸法・SHA-256 が納品物と一致）。`);
md.push(`- 画面データの照合: 公開 URL ${walk.address}（配信中のコミット ${walk.liveCommit ?? "—"}）を新しいブラウザーセッションで操作し、DOM の currentSrc・naturalWidth・naturalHeight を台帳と照合（患者側 390×844、医療者側 1024×768）。`);
md.push(`- 目視: 公開版で撮った代表スクリーンショット（shots/）に写っている ID だけ「目視」とし、それ以外は DOM 照合のみ。患者側・医療者側で本来見えないものはその旨を書く。`, "");
md.push(`合計: ${rows.filter((r) => r.ok).length}／${rows.length} ID が合格（本文 ${rows.filter((r) => r.kind === "editorial" && r.ok).length}／29、サムネイル ${rows.filter((r) => r.kind === "thumbnail" && r.ok).length}／22、表紙 ${rows.filter((r) => r.kind === "cover" && r.ok).length}／6）。配信ファイル ${batch.rows.flatMap((r) => r.files).filter((f) => f.local === "一致" && (f.dist === "一致" || f.dist === "—") && (f.live === "一致" || f.live === "—")).length}／79 が一致。`, "");
md.push("| ID | 種類 | 教材／セット・ページ | 配信パス | SHA-256・寸法 | 公開 URL の応答 | 患者側（DOM） | 医療者側（DOM） | 目視（スクリーンショット） | 判定 |");
md.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) md.push(`| ${r.id} | ${kindJa[r.kind]} | ${r.where} | ${r.fileCells} | ${r.sha} | ${r.liveDetail || "—"} | ${r.patient} | ${r.clinician} | ${r.visuals} | ${r.ok ? "合格" : "要確認"}${r.problems ? `（${r.problems}）` : ""} |`);
writeFileSync(path.join(out, "verification_table.md"), md.join("\n") + "\n");
const csvEscape = (s) => `"${String(s ?? "").replace(/"/g, '""').replace(/<br>/g, " | ")}"`;
const csv = [["id", "kind", "target", "alt", "urls", "files", "sha", "live", "patient_dom", "clinician_dom", "visual", "problems", "ok"].join(",")];
for (const r of rows) csv.push([r.id, kindJa[r.kind], r.where, r.alt, r.urls, r.fileCells, r.sha, r.liveDetail, r.patient, r.clinician, r.visuals, r.problems, r.ok ? "合格" : "要確認"].map(csvEscape).join(","));
writeFileSync(path.join(out, "verification_table.csv"), "﻿" + csv.join("\n") + "\n");
console.log(`verification_table.md / .csv: ${rows.filter((r) => r.ok).length}/${rows.length} 合格 → ${out}`);
process.exit(rows.every((r) => r.ok) ? 0 : 1);
