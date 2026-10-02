/** Task 101: a secret forces a favor — once. */

import { describe, expect, it } from "vitest";
import { callInFavor, uncoverSecret } from "../blackmail.js";

describe("blackmail (task 101)", () => {
  it("uncovers a usable secret", () => {
    const s = uncoverSecret("the duke", "skimming the harbor tolls");
    expect(s.spent).toBe(false);
  });

  it("a secret forces a favor with concrete terms", () => {
    const s = uncoverSecret("the duke", "skimming the harbor tolls");
    const r = callInFavor(s, "vote");
    expect(r).not.toBeNull();
    expect(r!.favor.kind).toBe("vote");
    expect(r!.favor.terms).toContain("the duke");
    expect(r!.secret.spent).toBe(true);
  });

  it("a spent secret buys nothing twice", () => {
    const s = uncoverSecret("the duke", "skimming the harbor tolls");
    const r = callInFavor(s, "gold")!;
    expect(callInFavor(r.secret, "silence")).toBeNull();
  });
});
