/** Task 97: the fallout preview lists suspects before the plot burns. */

import { describe, expect, it } from "vitest";
import { previewFallout, startPlot } from "../plots.js";

describe("fallout preview (task 97)", () => {
  it("always implicates the spymaster", () => {
    const suspects = previewFallout(startPlot("the duke"));
    expect(suspects[0]!.role).toBe("your spymaster");
  });

  it("adds assets and the guard as stages complete", () => {
    const early = previewFallout({ ...startPlot("the duke"), stage: 1 });
    expect(early.map((s) => s.role)).toContain("the recruited assets");
    expect(early.map((s) => s.role)).not.toContain("the bribed guard");
    const late = previewFallout({ ...startPlot("the duke"), stage: 3 });
    expect(late.map((s) => s.role)).toContain("the bribed guard");
  });

  it("raises the spymaster's risk in later stages", () => {
    expect(previewFallout(startPlot("x"))[0]!.risk).toBe("low");
    expect(previewFallout({ ...startPlot("x"), stage: 2 })[0]!.risk).toBe("high");
  });
});
