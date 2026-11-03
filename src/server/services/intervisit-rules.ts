import { fmtDate } from "./intervisit-format";
import { VITAL_KEYS, type Intervisit } from "./intervisit";

/**
 * ルールベースの外来間サマリー（Phase 2 Step 4-B）。構造化データだけから決まった文型で作る。
 * Claude の要約が使えない・検証を通らないときの代替表示で、AI 生成とは画面上で区別する。
 * 各文に根拠の ID（出来事 ID・集計 ID）を付ける。解釈（改善・悪化・正常・因果・Grade）は書かない。
 */
export const SECTIONS = ["体調の変化", "学習の状況", "患者からの質問", "時系列の経過"] as const;
export type Section = (typeof SECTIONS)[number];
export type SummaryItem = { section: Section; text: string; sourceIds: string[] };

/** 集計値の参照 ID（要約が「何件」「最小〜最大」などを書くときの根拠） */
export const statIds = {
  records: "stat:records",
  vital: (k: string) => `stat:vital:${k}`,
  symptom: (k: string) => `stat:symptom:${k}`,
};

const d = (iso: string) => fmtDate(new Date(iso));

export function ruleSummary(iv: Intervisit): SummaryItem[] {
  const items: SummaryItem[] = [];
  const range = `${iv.fmt.from}〜${iv.fmt.to}`;

  // 体調の変化
  const v = iv.vitals;
  if (v.recordCount === 0) {
    items.push({ section: "体調の変化", text: `${range}の体調記録はありません（欠測）。`, sourceIds: [statIds.records] });
  } else {
    items.push({ section: "体調の変化", text: `体調記録は${v.totalDays}日中${v.recordDays}日、${v.recordCount}件です。記録のない日は欠測です。`, sourceIds: [statIds.records] });
    for (const k of VITAL_KEYS) {
      const m = v.metrics[k];
      if (!m.count || !m.min || !m.max) continue;
      const text =
        m.min.value === m.max.value
          ? `${m.label}は${m.count}回測定され、いずれも${m.min.value}${m.unit}でした。`
          : `${m.label}は${m.count}回測定され、最小${m.min.value}${m.unit}（${d(m.min.at)}）、最大${m.max.value}${m.unit}（${d(m.max.at)}）でした。`;
      items.push({ section: "体調の変化", text, sourceIds: [statIds.vital(k), m.min.sourceId, m.max.sourceId] });
    }
    for (const s of iv.symptoms) {
      const ids = [statIds.symptom(s.key), s.first.sourceId, s.last.sourceId];
      let text: string;
      if (s.changed) {
        const maxE = s.entries.find((e) => e.severity === s.max)!;
        ids.push(maxE.sourceId);
        text = `${s.name}は${d(s.first.at)}に${s.first.severity}/4、${d(s.last.at)}に${s.last.severity}/4と記録されました（期間内の最大は${d(maxE.at)}の${s.max}/4、${s.count}回記録）。`;
      } else {
        text = `${s.name}は${s.count}回記録され、いずれも${s.first.severity}/4でした（${d(s.first.at)}〜${d(s.last.at)}）。`;
      }
      if (s.newInPeriod) text = `期間内に初めて記録された症状：${text}`;
      items.push({ section: "体調の変化", text, sourceIds: ids });
      if (s.stoppedRecording)
        items.push({ section: "体調の変化", text: `${s.name}は${d(s.last.at)}より後の体調記録では回答がありません（欠測）。`, sourceIds: [statIds.symptom(s.key), s.last.sourceId] });
    }
  }

  // 学習の状況
  const relevant = iv.learning.filter(
    (l) =>
      l.answersInPeriod.length > 0 ||
      iv.events.some((e) => (e.kind === "prescription" || e.kind === "learning_start" || e.kind === "learning_complete") && e.data.versionId === l.versionId),
  );
  if (relevant.length === 0) items.push({ section: "学習の状況", text: `${range}に処方・学習・理解確認の記録はありません。`, sourceIds: [statIds.records] });
  for (const l of relevant) {
    const ids: string[] = [];
    const parts: string[] = [];
    const rx = iv.events.find((e) => e.kind === "prescription" && e.data.versionId === l.versionId);
    if (rx) {
      parts.push(`${d(rx.at)}に処方`);
      ids.push(rx.id);
    }
    const st = iv.events.find((e) => e.kind === "learning_start" && e.data.versionId === l.versionId);
    if (st) {
      parts.push(`${d(st.at)}に学習開始`);
      ids.push(st.id);
    }
    const done = iv.events.find((e) => e.kind === "learning_complete" && e.data.versionId === l.versionId);
    if (done) {
      parts.push(`${d(done.at)}に理解確認まで完了`);
      ids.push(done.id);
    } else parts.push(`現在は${l.status}`);
    const unknown = l.answersInPeriod.filter((a) => a.result === "わからない");
    const wrong = l.answersInPeriod.filter((a) => a.result === "誤答");
    let text = `「${l.title}」（第${l.versionNo}版）は${parts.join("、")}です。`;
    if (unknown.length || wrong.length) {
      const stem = (t: string) => `「${t.replace(/[。？?]$/, "")}」`;
      const list = [...unknown.map((a) => `「わからない」${stem(a.stem)}`), ...wrong.map((a) => `誤答${stem(a.stem)}`)];
      text += `理解確認の回答：${list.join("、")}。`;
      ids.push(...unknown.map((a) => a.sourceId), ...wrong.map((a) => a.sourceId));
    } else if (l.answersInPeriod.length) {
      text += `期間内の理解確認の回答${l.answersInPeriod.length}件に誤答・「わからない」はありません。`;
      ids.push(...l.answersInPeriod.map((a) => a.sourceId));
    }
    items.push({ section: "学習の状況", text, sourceIds: ids.length ? ids : [statIds.records] });
  }

  // 患者からの質問（原文のまま）
  if (iv.questions.length === 0) items.push({ section: "患者からの質問", text: `${range}に保存された質問はありません。`, sourceIds: [statIds.records] });
  for (const q of iv.questions)
    items.push({
      section: "患者からの質問",
      text: `${d(q.createdAt)}（${q.kind}${q.materialTitle ? `・「${q.materialTitle}」` : ""}）：「${q.body}」`,
      sourceIds: [q.sourceId],
    });

  // 時系列の経過（症状の記録・回答の誤答と「わからない」・質問・処方・完了。日付順）
  const notable = iv.events.filter(
    (e) =>
      e.kind === "symptom" ||
      e.kind === "prescription" ||
      e.kind === "learning_complete" ||
      e.kind === "note" ||
      e.kind === "feedback" ||
      (e.kind === "answer" && e.data.result !== "正答"),
  );
  const byDay = new Map<string, typeof notable>();
  for (const e of notable) (byDay.get(e.day) ?? byDay.set(e.day, []).get(e.day)!).push(e);
  for (const [, es] of byDay)
    items.push({ section: "時系列の経過", text: `${d(es[0].at)}：${es.map((e) => e.label).join("、")}`, sourceIds: es.map((e) => e.id) });
  return items;
}

/** 根拠として参照できる ID → その内容（集計 ID を含む） */
export function sourceIndex(iv: Intervisit) {
  const map = new Map<string, { label: string; at?: string; values: string[] }>();
  const strs = (o: unknown): string[] =>
    o == null ? [] : typeof o === "object" ? Object.values(o as Record<string, unknown>).flatMap(strs) : [String(o)];
  for (const e of iv.events) map.set(e.id, { label: e.label, at: e.at, values: [e.label, ...strs(e.data)] });
  map.set(statIds.records, { label: `体調記録 ${iv.vitals.totalDays}日中${iv.vitals.recordDays}日・${iv.vitals.recordCount}件（${iv.fmt.from}〜${iv.fmt.to}）`, values: [String(iv.vitals.totalDays), String(iv.vitals.recordDays), String(iv.vitals.recordCount), iv.period.from, iv.period.to] });
  for (const k of VITAL_KEYS) {
    const m = iv.vitals.metrics[k];
    if (!m.count) continue;
    map.set(statIds.vital(k), { label: `${m.label} ${m.count}回（${m.min!.value}〜${m.max!.value}${m.unit}）`, values: [String(m.count), String(m.min!.value), String(m.max!.value), String(m.measuredDays)] });
  }
  for (const s of iv.symptoms)
    map.set(statIds.symptom(s.key), { label: `${s.name} ${s.count}回（${s.min}〜${s.max}/4）`, values: [s.name, String(s.count), String(s.min), String(s.max)] });
  return map;
}
