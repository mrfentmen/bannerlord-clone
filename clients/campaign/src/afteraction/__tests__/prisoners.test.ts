/** Task 116: bulk actions on 50+ prisoners. */

import { describe, expect, it } from "vitest";
import {
  bulkAction,
  clearSelection,
  createRoster,
  selectAll,
  selectedRansomValue,
  toggleSelect,
} from "../prisoners.js";

function fifty() {
  return Array.from({ length: 60 }, (_, i) => ({
    id: `p${i}`,
    name: `Captive ${i}`,
    tier: 2,
    ransomValue: 50,
  }));
}

describe("prisoner management (task 116)", () => {
  it("select-all + bulk ransom clears 60 prisoners", () => {
    const roster = createRoster(fifty());
    selectAll(roster);
    expect(roster.selected.size).toBe(60);
    expect(selectedRansomValue(roster)).toBe(3000);
    const affected = bulkAction(roster, "ransom");
    expect(affected).toHaveLength(60);
    expect(roster.prisoners).toHaveLength(0);
  });

  it("toggle selects individuals; clear empties", () => {
    const roster = createRoster(fifty());
    toggleSelect(roster, "p1");
    toggleSelect(roster, "p2");
    expect(roster.selected.size).toBe(2);
    toggleSelect(roster, "p1");
    expect(roster.selected.size).toBe(1);
    clearSelection(roster);
    expect(roster.selected.size).toBe(0);
  });

  it("bulk recruit affects only the selection", () => {
    const roster = createRoster(fifty());
    toggleSelect(roster, "p0");
    const affected = bulkAction(roster, "recruit");
    expect(affected.map((p) => p.id)).toEqual(["p0"]);
    expect(roster.prisoners).toHaveLength(59);
  });
});
