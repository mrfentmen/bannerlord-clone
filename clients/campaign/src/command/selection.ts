/**
 * The selection model: click, drag box-select, select-all, and control groups.
 *
 * Pure logic — no DOM, no input bindings. The commander wires gestures and keys
 * to these operations; tests drive the model directly.
 */

import type { CommandableUnit } from "./types.js";

export interface SelectionModel {
  /** Currently selected unit ids, in selection order. */
  selected(): string[];
  select(ids: string[]): void;
  toggle(id: string): void;
  /**
   * Task 67: add an id to the selection without removing anything, and without
   * moving it if it is already selected. Returns true when the selection grew.
   */
  add(id: string): boolean;
  clear(): void;
  /** Box-select: every live unit whose position falls inside the field rect. */
  boxSelect(units: CommandableUnit[], x0: number, z0: number, x1: number, z1: number): string[];
  /**
   * Task 66: double-click — every live unit of the clicked unit's kind, in the
   * order the units are listed. Returns the ids it selected.
   */
  selectAllOfKind(units: CommandableUnit[], kind: string): string[];
  /** Bind the current selection to control group n (1-9). */
  assignGroup(n: number): void;
  /** Recall control group n into the selection. */
  recallGroup(n: number): void;
  group(n: number): string[];
  onChanged(fn: () => void): () => void;
}

export function createSelection(): SelectionModel {
  let selected: string[] = [];
  const groups = new Map<number, string[]>();
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const fn of listeners) fn();
  }

  function set(next: string[]): void {
    const changed =
      next.length !== selected.length || next.some((id, i) => id !== selected[i]);
    if (!changed) return;
    selected = [...next];
    emit();
  }

  return {
    selected: () => [...selected],

    select(ids) {
      set(ids);
    },

    toggle(id) {
      set(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    },

    add(id) {
      if (selected.includes(id)) return false;
      set([...selected, id]);
      return true;
    },

    clear() {
      set([]);
    },

    boxSelect(units, x0, z0, x1, z1) {
      const minX = Math.min(x0, x1);
      const maxX = Math.max(x0, x1);
      const minZ = Math.min(z0, z1);
      const maxZ = Math.max(z0, z1);
      const hit = units
        .filter((u) => u.count > 0)
        .filter((u) => u.x >= minX && u.x <= maxX && u.z >= minZ && u.z <= maxZ)
        .map((u) => u.id);
      set(hit);
      return hit;
    },

    selectAllOfKind(units, kind) {
      const hit = units.filter((u) => u.count > 0 && u.kind === kind).map((u) => u.id);
      set(hit);
      return hit;
    },

    assignGroup(n) {
      if (n < 1 || n > 9 || selected.length === 0) return;
      groups.set(n, [...selected]);
    },

    recallGroup(n) {
      const g = groups.get(n);
      if (!g || g.length === 0) return;
      set([...g]);
    },

    group: (n) => [...(groups.get(n) ?? [])],

    onChanged(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
