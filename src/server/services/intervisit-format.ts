/** 外来間サマリーの日時表記（日本時間で固定。サーバーのタイムゾーンに依存しない） */
export const TZ = "Asia/Tokyo";
const parts = (d: Date) => {
  const f = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const o = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return { y: o.year, m: Number(o.month), d: Number(o.day), hh: o.hour === "24" ? "00" : o.hour, mm: o.minute };
};
/** YYYY-MM-DD（日本時間） */
export const localDay = (d: Date) => {
  const p = parts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
};
/** 「11月4日」 */
export const fmtDate = (d: Date) => {
  const p = parts(d);
  return `${p.m}月${p.d}日`;
};
/** 「11月4日 08:10」 */
export const fmtDateTime = (d: Date) => {
  const p = parts(d);
  return `${p.m}月${p.d}日 ${p.hh}:${p.mm}`;
};
const SEVERITY = ["なし", "軽い", "中くらい", "強い", "非常に強い"];
export const severityLabelOf = (n: number) => SEVERITY[n] ?? String(n);
