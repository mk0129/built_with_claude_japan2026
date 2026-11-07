import { describe, expect, it } from "vitest";
import {
  HEALTH_DRAFT_KEY,
  answeredSymptoms,
  clearHealthDraft,
  hasDraftInput,
  parseHealthDraft,
  readHealthDraft,
  writeHealthDraft,
  type HealthDraft,
} from "@/concept-d/healthDraft";

/** sessionStorage の代わり（このテストの中だけ） */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const emptyVitals = { temperature: "", systolic: "", diastolic: "", pulse: "", spo2: "" };
const draft = (over: Partial<HealthDraft> = {}): HealthDraft => ({
  measuredAt: "2026-11-07T09:30",
  vitals: emptyVitals,
  symptoms: {},
  details: {},
  editingId: null,
  ...over,
});

describe("体調記録の下書き（保存前の入力）", () => {
  it("同じ患者なら症状一つだけの下書きを戻せる", () => {
    const store = memoryStorage();
    writeHealthDraft("patient-a", draft({ symptoms: { numbness: 2 } }), store);
    expect(readHealthDraft("patient-a", store)).toEqual(draft({ symptoms: { numbness: 2 } }));
  });

  it("別の患者には下書きを渡さず、読んだ時点で消す（患者を切り替えても持ち越さない）", () => {
    const store = memoryStorage();
    writeHealthDraft("patient-a", draft({ symptoms: { numbness: 2 } }), store);
    expect(readHealthDraft("patient-b", store)).toBeNull();
    expect(store.map.has(HEALTH_DRAFT_KEY)).toBe(false);
    expect(readHealthDraft("patient-a", store)).toBeNull();
  });

  it("程度 0（なし）は入力として残し、未入力は 0 にしない", () => {
    const store = memoryStorage();
    expect(answeredSymptoms({ fatigue: 0, nausea: undefined, numbness: 3 })).toEqual({ fatigue: 0, numbness: 3 });
    expect(hasDraftInput({ vitals: emptyVitals, symptoms: { fatigue: 0 }, details: {} })).toBe(true);
    writeHealthDraft("patient-a", draft({ symptoms: answeredSymptoms({ fatigue: 0, nausea: undefined }) }), store);
    const restored = readHealthDraft("patient-a", store)!;
    expect(restored.symptoms).toEqual({ fatigue: 0 });
    expect("nausea" in restored.symptoms).toBe(false);
  });

  it("入力がない（測定日時だけ）なら下書きを作らず、前の下書きも消す", () => {
    const store = memoryStorage();
    writeHealthDraft("patient-a", draft({ symptoms: { numbness: 1 } }), store);
    writeHealthDraft("patient-a", draft(), store);
    expect(store.map.has(HEALTH_DRAFT_KEY)).toBe(false);
    writeHealthDraft("patient-a", draft({ details: { numbness: { location: "  " } } }), store);
    expect(store.map.has(HEALTH_DRAFT_KEY)).toBe(false);
  });

  it("バイタルだけ・詳細だけの入力も下書きになる", () => {
    expect(hasDraftInput({ vitals: { ...emptyVitals, temperature: "36.8" }, symptoms: {}, details: {} })).toBe(true);
    expect(hasDraftInput({ vitals: emptyVitals, symptoms: {}, details: { numbness: { location: "両手の指" } } })).toBe(true);
  });

  it("範囲外・小数・文字列の程度、壊れた形は捨てる", () => {
    const raw = JSON.stringify({
      v: 1,
      owner: "patient-a",
      measuredAt: "2026-11-07T09:30",
      vitals: { temperature: 36.5, pulse: "70" },
      symptoms: { a: 5, b: -1, c: 1.5, d: "2", e: 4 },
      details: { e: { location: "足", count: 3 }, f: "x" },
      editingId: 42,
    });
    expect(parseHealthDraft(raw, "patient-a")).toEqual({
      measuredAt: "2026-11-07T09:30",
      vitals: { ...emptyVitals, pulse: "70" },
      symptoms: { e: 4 },
      details: { e: { location: "足" } },
      editingId: null,
    });
    expect(parseHealthDraft("{", "patient-a")).toBeNull();
    expect(parseHealthDraft(JSON.stringify({ v: 2, owner: "patient-a", measuredAt: "x", symptoms: { e: 1 } }), "patient-a")).toBeNull();
    const store = memoryStorage();
    store.setItem(HEALTH_DRAFT_KEY, "{");
    expect(readHealthDraft("patient-a", store)).toBeNull();
    expect(store.map.has(HEALTH_DRAFT_KEY)).toBe(false);
  });

  it("保存後に消すと、戻っても同じ入力は出てこない（重複保存しない）", () => {
    const store = memoryStorage();
    writeHealthDraft("patient-a", draft({ symptoms: { numbness: 2 } }), store);
    clearHealthDraft(store);
    expect(readHealthDraft("patient-a", store)).toBeNull();
  });

  it("保存できない環境（容量超過など）でも例外を出さない", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => writeHealthDraft("patient-a", draft({ symptoms: { numbness: 2 } }), broken)).not.toThrow();
    expect(readHealthDraft("patient-a", broken)).toBeNull();
    expect(() => clearHealthDraft(broken)).not.toThrow();
    // window のない環境（サーバー描画）では何もしない
    expect(readHealthDraft("patient-a")).toBeNull();
  });
});
