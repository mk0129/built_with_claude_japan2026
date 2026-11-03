import { describe, expect, it } from "vitest";
import { DOMAIN_LABEL, ROLE_LABEL } from "@/lib/labels";
import { DOMAIN_TAGS } from "@/server/db/domain-schema";
import { JOB_MODE_LABEL, STATUS_LABEL, modelLabel } from "@/lib/studio-shared";

/** UX-02: 内部コードが UI に出ないよう、ラベル表が列挙値を網羅していることを固定する */
describe("UI ラベル（UX-02 回帰）", () => {
  it("領域コードはすべて日本語ラベルを持つ", () => {
    for (const d of DOMAIN_TAGS) expect(DOMAIN_LABEL[d], d).toMatch(/[ぁ-んァ-ン一-龥]/);
  });
  it("役割コードはすべて日本語ラベルを持つ", () => {
    for (const r of ["clinician", "material_editor", "material_approver", "org_admin"]) expect(ROLE_LABEL[r], r).toMatch(/[ぁ-んァ-ン一-龥]/);
  });
  it("教材・ジョブの状態とジョブ種別はすべて日本語ラベルを持ち、内部記号（B/C）を含まない", () => {
    for (const s of ["draft", "in_review", "approved", "published", "superseded", "retired", "queued", "running", "succeeded", "failed"]) expect(STATUS_LABEL[s], s).toBeTruthy();
    for (const m of ["outline", "generate", "freeform"]) {
      expect(JOB_MODE_LABEL[m], m).toBeTruthy();
      expect(JOB_MODE_LABEL[m]).not.toMatch(/\((B|C)\)|（(B|C)）/);
    }
  });
  it("擬似生成のモデル名（fake:）は表示しない", () => {
    expect(modelLabel("fake", "fake:claude-sonnet-5-5")).toBeNull();
    expect(modelLabel("mock", "mock")).toBeNull();
    expect(modelLabel("claude", "claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
  });
});
