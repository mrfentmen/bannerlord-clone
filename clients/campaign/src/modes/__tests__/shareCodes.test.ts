import { describe, expect, it } from "vitest";
import { exportShareCode, importShareCode, skirmishShareCode } from "../shareCodes.js";
import { generateSkirmish } from "../skirmish.js";

describe("custom battle share codes (solo task 36)", () => {
  it("round-trips a battle setup", () => {
    const config = generateSkirmish(1234);
    const code = exportShareCode(config);
    expect(code.startsWith("BL-")).toBe(true);
    const result = importShareCode(code);
    expect(result.ok).toBe(true);
    expect(result.config).toEqual(config);
  });

  it("round-trips through the skirmish helper", () => {
    const result = importShareCode(skirmishShareCode(99));
    expect(result.ok).toBe(true);
    expect(result.config?.seed).toBe(99);
  });

  it("rejects non-codes with a reason", () => {
    const result = importShareCode("hello");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("BL-");
  });

  it("rejects corrupted codes", () => {
    const result = importShareCode("BL-!!not-base64!!");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("rejects truncated codes missing data", () => {
    const code = "BL-" + Buffer.from(JSON.stringify({ v: 1 }), "utf8").toString("base64url");
    const result = importShareCode(code);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("missing");
  });

  it("tolerates surrounding whitespace", () => {
    const code = exportShareCode(generateSkirmish(7));
    expect(importShareCode(`  ${code}\n`).ok).toBe(true);
  });
});
