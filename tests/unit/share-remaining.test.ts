import { describe, expect, it } from "vitest";
import { remainingOf } from "@/concept-d/live";

/** 一時共有の残り時間: 患者と医療者で同じ計算（秒に切り捨て → 分に切り上げ、上限 60 分） */
describe("remainingOf", () => {
  const now = Date.parse("2026-11-04T09:00:00+09:00");
  const at = (ms: number) => new Date(now + ms).toISOString();

  it("承認直後（端末の時計がサーバーより少し遅れていても）60分で、61分にならない", () => {
    expect(remainingOf(at(60 * 60_000), now)).toEqual({ sec: 3600, min: 60 });
    expect(remainingOf(at(60 * 60_000 + 900), now)).toEqual({ sec: 3600, min: 60 });
    expect(remainingOf(at(61 * 60_000), now).min).toBe(60);
  });
  it("59分56秒は 60分、59分ちょうどは 59分", () => {
    expect(remainingOf(at((59 * 60 + 56) * 1000), now).min).toBe(60);
    expect(remainingOf(at(59 * 60_000), now).min).toBe(59);
  });
  it("期限を過ぎたら 0", () => {
    expect(remainingOf(at(-5000), now)).toEqual({ sec: 0, min: 0 });
  });
});
