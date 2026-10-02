/** Task 110: notable relationships from the injected source. */

import { describe, expect, it } from "vitest";
import { relationBand, sortNotables } from "../notables.js";

const source = () => [
  { id: "n1", name: "Ash", townId: "harbor", relation: 80, title: "Harbor master" },
  { id: "n2", name: "Vex", townId: "rust", relation: -70 },
  { id: "n3", name: "Mira", townId: "iron", relation: 10 },
];

describe("notables panel (task 110)", () => {
  it("sorts best relations first", () => {
    expect(sortNotables(source).map((n) => n.id)).toEqual(["n1", "n3", "n2"]);
  });

  it("bands relations honestly", () => {
    expect(relationBand(80)).toBe("allied");
    expect(relationBand(10)).toBe("neutral");
    expect(relationBand(-70)).toBe("hostile");
  });

  it("an empty source is an honest empty state", () => {
    expect(sortNotables(() => [])).toEqual([]);
  });
});
