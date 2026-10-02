/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  completeRecruitmentStage,
  RECRUITMENT_CHAINS,
  recruitmentProgress,
} from "../recruitment.js";

beforeEach(() => localStorage.clear());

describe("companion recruitment missions (solo task 54)", () => {
  it("has chains with multiple stages", () => {
    expect(RECRUITMENT_CHAINS.length).toBeGreaterThanOrEqual(2);
    for (const chain of RECRUITMENT_CHAINS) {
      expect(chain.stages.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("completes stages in order and recruits at the end", () => {
    let p = completeRecruitmentStage("comp-kael", "find");
    expect(p.recruited).toBe(false);
    p = completeRecruitmentStage("comp-kael", "earn-trust", { prowess: 50 });
    expect(p.recruited).toBe(false);
    p = completeRecruitmentStage("comp-kael", "oath");
    expect(p.recruited).toBe(true);
    expect(recruitmentProgress("comp-kael").recruited).toBe(true);
  });

  it("enforces stage order", () => {
    expect(() => completeRecruitmentStage("comp-kael", "oath")).toThrow('complete "find" first');
  });

  it("enforces skill requirements", () => {
    completeRecruitmentStage("comp-kael", "find");
    expect(() => completeRecruitmentStage("comp-kael", "earn-trust", { prowess: 10 })).toThrow(
      "needs prowess 30",
    );
  });

  it("rejects unknown chains and stages", () => {
    expect(() => completeRecruitmentStage("nope", "find")).toThrow("unknown recruitment chain");
    expect(() => completeRecruitmentStage("comp-kael", "nope")).toThrow("unknown recruitment stage");
  });

  it("survives reload", () => {
    completeRecruitmentStage("comp-sera", "find");
    expect(recruitmentProgress("comp-sera").completedStageIds).toEqual(["find"]);
  });
});
