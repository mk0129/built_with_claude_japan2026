import { describe, expect, it } from "vitest";
import { isNewRx, isRecentRx, rxKey } from "@/concept-d/learning";

/** 患者ホームの「新着」（今回の処方を開いたか）の判定。サーバーは変えず、処方の鍵だけで判定する */
const item = (materialId: string, setId: string, createdAt: string) => ({
  materialId,
  prescribed: { setId, createdAt, orgName: "さくら総合病院（架空）", clinicianName: "山田 医師", latest: true, note: null },
});

describe("今回の処方の鍵（rxKey）", () => {
  it("同じ教材でも、処方の記録（ID・日時）が新しくなれば鍵が変わる（再処方）", () => {
    const first = rxKey([item("m1", "rx-1", "2026-10-25T01:00:00Z")]);
    const again = rxKey([item("m1", "rx-2", "2026-11-07T01:00:00Z")]);
    expect(first).not.toBe(again);
  });
  it("教材の並び順に依存しない。処方がなければ空", () => {
    const a = rxKey([item("m1", "rx-1", "2026-11-07T01:00:00Z"), item("m2", "rx-1", "2026-11-07T01:00:00Z")]);
    const b = rxKey([item("m2", "rx-1", "2026-11-07T01:00:00Z"), item("m1", "rx-1", "2026-11-07T01:00:00Z")]);
    expect(a).toBe(b);
    expect(rxKey([])).toBe("");
  });
  it("同じ処方に教材が追加されると鍵が変わる", () => {
    const one = rxKey([item("m1", "rx-1", "2026-11-07T01:00:00Z")]);
    const two = rxKey([item("m1", "rx-1", "2026-11-07T01:00:00Z"), item("m2", "rx-1", "2026-11-07T01:00:00Z")]);
    expect(one).not.toBe(two);
  });
});

describe("新着の判定（isNewRx）", () => {
  it("開いた処方と同じ鍵なら新着ではない／別の鍵（再処方を含む）なら新着", () => {
    expect(isNewRx("k2", "k2", true)).toBe(false);
    expect(isNewRx("k2", "k1", true)).toBe(true);
    expect(isNewRx("k2", "k1", false)).toBe(true);
  });
  it("この端末で初めて開いたとき: 未学習の教材があれば新着、すべて読み始めた古い処方は新着にしない", () => {
    expect(isNewRx("k1", null, false)).toBe(true);
    expect(isNewRx("k1", null, true, false)).toBe(false);
  });
  it("この端末で初めて開いたときでも、最近の処方（読み始めた教材の再処方）は新着", () => {
    expect(isNewRx("k1", null, true, true)).toBe(true);
  });
  it("処方がない・保存の読み込み前は新着を出さない", () => {
    expect(isNewRx("", "k1", false)).toBe(false);
    expect(isNewRx("k1", undefined, false)).toBe(false);
  });
  it("最近の処方: 3 日以内だけ。日時が読めなければ最近ではない", () => {
    const now = Date.parse("2026-11-07T03:00:00Z");
    expect(isRecentRx("2026-11-07T01:00:00Z", now)).toBe(true);
    expect(isRecentRx("2026-10-25T01:00:00Z", now)).toBe(false);
    expect(isRecentRx("", now)).toBe(false);
  });
});
