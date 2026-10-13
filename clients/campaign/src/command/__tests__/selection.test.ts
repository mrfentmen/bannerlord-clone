/**
 * Selection model contract: click select, shift-toggle, drag box-select,
 * select-all-of-kind, Ctrl+click add, control groups.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { createSelection } from "../selection.js";
import type { CommandableUnit } from "../types.js";

const units: CommandableUnit[] = [
  { id: "a", label: "A", kind: "infantry", count: 10, x: 0, z: 0 },
  { id: "b", label: "B", kind: "archers", count: 8, x: 5, z: 5 },
  { id: "c", label: "C", kind: "cavalry", count: 6, x: 50, z: 50 },
  { id: "dead", label: "D", kind: "infantry", count: 0, x: 2, z: 2 },
];

describe("selection model", () => {
  it("selects and clears", () => {
    const s = createSelection();
    expect(s.selected()).toEqual([]);
    s.select(["a", "b"]);
    expect(s.selected()).toEqual(["a", "b"]);
    s.clear();
    expect(s.selected()).toEqual([]);
  });

  it("toggles ids in and out", () => {
    const s = createSelection();
    s.toggle("a");
    s.toggle("b");
    expect(s.selected()).toEqual(["a", "b"]);
    s.toggle("a");
    expect(s.selected()).toEqual(["b"]);
  });

  it("box-select grabs every live unit inside the rect, regardless of drag direction", () => {
    const s = createSelection();
    expect(s.boxSelect(units, 0, 0, 10, 10)).toEqual(["a", "b"]);
    expect(s.boxSelect(units, 10, 10, 0, 0)).toEqual(["a", "b"]);
    expect(s.boxSelect(units, 40, 40, 60, 60)).toEqual(["c"]);
  });

  it("box-select skips destroyed units", () => {
    const s = createSelection();
    // "dead" sits at (2,2) inside the box but has count 0.
    expect(s.boxSelect(units, 0, 0, 10, 10)).toEqual(["a", "b"]);
  });

  it("add() grows the selection and leaves a selected id alone (task 67)", () => {
    const s = createSelection();
    expect(s.add("a")).toBe(true);
    expect(s.selected()).toEqual(["a"]);

    expect(s.add("b")).toBe(true);
    expect(s.selected()).toEqual(["a", "b"]);

    // Already in: no change, no reordering, no duplicate.
    expect(s.add("a")).toBe(false);
    expect(s.selected()).toEqual(["a", "b"]);
  });

  it("select-all-of-kind takes every live unit of one kind (task 66)", () => {
    const s = createSelection();
    // units: a infantry, b archers, c cavalry, dead infantry (count 0).
    expect(s.selectAllOfKind(units, "infantry")).toEqual(["a"]);
    expect(s.selected()).toEqual(["a"]);

    expect(s.selectAllOfKind(units, "archers")).toEqual(["b"]);
    expect(s.selectAllOfKind(units, "cavalry")).toEqual(["c"]);

    // Nothing of that kind: the selection empties rather than going stale.
    expect(s.selectAllOfKind(units, "siege")).toEqual([]);
    expect(s.selected()).toEqual([]);
  });

  it("select-all-of-kind covers several units of the same kind", () => {
    const mixed: CommandableUnit[] = [
      { id: "x", label: "X", kind: "infantry", count: 4, x: 0, z: 0 },
      { id: "y", label: "Y", kind: "infantry", count: 3, x: 1, z: 1 },
      { id: "z", label: "Z", kind: "archers", count: 2, x: 2, z: 2 },
    ];
    const s = createSelection();
    expect(s.selectAllOfKind(mixed, "infantry")).toEqual(["x", "y"]);
    expect(s.selected()).toEqual(["x", "y"]);
  });

  it("control groups assign the current selection and recall it", () => {
    const s = createSelection();
    s.select(["a", "c"]);
    s.assignGroup(1);
    s.select(["b"]);
    expect(s.selected()).toEqual(["b"]);
    s.recallGroup(1);
    expect(s.selected()).toEqual(["a", "c"]);
    expect(s.group(1)).toEqual(["a", "c"]);
  });

  it("recalling an empty group is a no-op", () => {
    const s = createSelection();
    s.select(["a"]);
    s.recallGroup(3);
    expect(s.selected()).toEqual(["a"]);
  });

  it("assigning with an empty selection does not clobber the group", () => {
    const s = createSelection();
    s.select(["a"]);
    s.assignGroup(2);
    s.clear();
    s.assignGroup(2);
    s.select(["b"]);
    s.recallGroup(2);
    expect(s.selected()).toEqual(["a"]);
  });

  it("notifies listeners on change, and only on change", () => {
    const s = createSelection();
    let calls = 0;
    const off = s.onChanged(() => calls++);
    s.select(["a"]);
    s.select(["a"]); // same content: no emit
    s.toggle("a");
    expect(calls).toBe(2);
    off();
    s.select(["b"]);
    expect(calls).toBe(2);
  });
});
