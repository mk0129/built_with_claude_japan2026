import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, treatmentLine, treatmentStatus, type TreatmentEvent, type TreatmentProfile } from "@/lib/treatment";

/**
 * 治療の「今どこか」の数え方。点滴は直近の点滴日を 1 日目、内服は開始日を 1 日目、放射線は回数、手術は手術日から。
 * 外来のみの日は数え方に影響しない。登録がなければ何も出さない（推定しない）。
 */
const ev = (date: string, kind: TreatmentEvent["kind"], courseNo: number | null = null): TreatmentEvent => ({ id: date + kind, date, kind, label: null, courseNo });
const p = (over: Partial<TreatmentProfile>): TreatmentProfile => ({ ...EMPTY_PROFILE, ...over });

describe("treatmentStatus", () => {
  it("点滴: 直近の点滴日が 1 日目。コース番号は記録の番号、なければ点滴の回数。外来のみの日は無視", () => {
    const events = [ev("2026-09-24", "infusion", 1), ev("2026-10-15", "infusion", 2), ev("2026-10-29", "visit_only")];
    const st = treatmentStatus(p({ modality: "infusion" }), events, "2026-11-04");
    expect(st.headline).toBe("点滴から 21日目");
    expect(st.detail).toBe("第2コース · 10月15日に点滴");
    expect(treatmentStatus(p({ modality: "infusion" }), [ev("2026-11-04", "infusion")], "2026-11-04").headline).toBe("点滴から 1日目");
    expect(treatmentStatus(p({ modality: "infusion" }), [ev("2026-10-01", "infusion"), ev("2026-10-22", "infusion")], "2026-10-23").detail).toBe("第2コース · 10月22日に点滴");
  });
  it("点滴: 記録がなければ開始日から。開始日もなければ出さない。未来の記録は数えない", () => {
    expect(treatmentStatus(p({ modality: "infusion", startDate: "2026-10-20" }), [], "2026-11-04").headline).toBe("点滴から 16日目");
    expect(treatmentStatus(p({ modality: "infusion" }), [], "2026-11-04").headline).toBeNull();
    expect(treatmentStatus(p({ modality: "infusion" }), [ev("2026-11-10", "infusion")], "2026-11-04").headline).toBeNull();
  });
  it("内服: 開始（再開）日から連続で数え、週も出す", () => {
    const st = treatmentStatus(p({ modality: "oral", startDate: "2026-10-01" }), [], "2026-10-23");
    expect(st.headline).toBe("内服を始めて 23日目");
    expect(st.detail).toBe("4週目 · 10月1日から");
    // 再開の記録があればそこから
    expect(treatmentStatus(p({ modality: "oral", startDate: "2026-10-01" }), [ev("2026-10-20", "oral_start")], "2026-10-23").headline).toBe("内服を始めて 4日目");
  });
  it("放射線: 照射の回数と予定回数。初回の日からの日数も持つ", () => {
    const st = treatmentStatus(p({ modality: "radiation", plannedSessions: 25 }), [ev("2026-11-02", "radiation"), ev("2026-11-03", "radiation"), ev("2026-11-04", "radiation")], "2026-11-04");
    expect(st.headline).toBe("放射線 3回目まで終了／25回");
    expect(st.dayNo).toBe(3);
  });
  it("手術: 手術日を 1 日目。経過観察: 最後の治療から。未設定: 出さない", () => {
    expect(treatmentStatus(p({ modality: "surgery" }), [ev("2026-10-28", "surgery")], "2026-11-04").headline).toBe("手術から 8日目");
    expect(treatmentStatus(p({ modality: "observation" }), [ev("2026-10-15", "infusion", 6), ev("2026-10-29", "visit_only")], "2026-11-04").headline).toBe("最後の治療から 21日目");
    expect(treatmentStatus(p({ modality: "observation" }), [ev("2026-10-29", "visit_only")], "2026-11-04").headline).toBeNull();
    expect(treatmentStatus(EMPTY_PROFILE, [ev("2026-10-15", "infusion")], "2026-11-04").headline).toBeNull();
  });
  it("医療者側の 1 行: がん種 · 治療（名前） · 何日目（詳細）。登録がなければ null", () => {
    expect(treatmentLine(p({ cancerType: "乳がん", modality: "infusion", treatmentName: "術後の化学療法" }), [ev("2026-10-15", "infusion", 2)], "2026-11-04")).toBe(
      "乳がん · 点滴の薬物療法（術後の化学療法） · 点滴から 21日目（第2コース · 10月15日に点滴）",
    );
    expect(treatmentLine(EMPTY_PROFILE, [], "2026-11-04")).toBeNull();
  });
});
