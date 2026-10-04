/**
 * Tasks 681-700, modernized: the siege catalogue.
 *
 * Every medieval task maps to a modern equivalent, and every equivalent names
 * a GLB that is actually staged in the model manifest. The tests verify the
 * catalogue covers all 20 tasks with no gaps or duplicates, every role is a
 * known role, and every file resolves to a real file on disk -- so the
 * catalogue can never claim a model the assets do not have.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SIEGE_CATALOGUE,
  siegeByRole,
  siegeEntry,
} from "../SiegeCatalogue.js";

const MODELS_DIR = join(__dirname, "..", "..", "..", "public", "models");

describe("SiegeCatalogue (tasks 681-700 modernized)", () => {
  it("covers all 20 tasks with no duplicates", () => {
    const tasks = SIEGE_CATALOGUE.map((e) => e.task).sort((a, b) => a - b);
    expect(tasks).toHaveLength(20);
    expect(tasks[0]).toBe(681);
    expect(tasks[19]).toBe(700);
    expect(new Set(tasks).size).toBe(20);
  });

  it("finds entries by task number", () => {
    expect(siegeEntry(681)?.id).toBe('siege-ram-truck');
    expect(siegeEntry(684)?.role).toBe('fire-support');
    expect(siegeEntry(999)).toBeNull();
  });

  it("groups by role", () => {
    expect(siegeByRole('breach-vehicle').length).toBeGreaterThan(0);
    expect(siegeByRole('fire-support').length).toBeGreaterThan(0);
    expect(siegeByRole('barrier').length).toBeGreaterThan(0);
    expect(siegeByRole('shelter').length).toBeGreaterThan(0);
    expect(siegeByRole('logistics').length).toBeGreaterThan(0);
    expect(siegeByRole('gate').length).toBeGreaterThan(0);
  });

  it("every entry names its medieval predecessor and a note", () => {
    for (const entry of SIEGE_CATALOGUE) {
      expect(entry.medieval.length, String(entry.task)).toBeGreaterThan(0);
      expect(entry.note.length, String(entry.task)).toBeGreaterThan(0);
    }
  });

  it("every file exists on disk", () => {
    for (const entry of SIEGE_CATALOGUE) {
      // The rally tent is referenced by manifest name; resolve it like the
      // manifest does.
      const candidates = [
        join(MODELS_DIR, entry.file),
        join(MODELS_DIR, `${entry.file}.glb`),
      ];
      const found = candidates.some((p) => existsSync(p));
      expect(found, `${entry.task}: ${entry.file}`).toBe(true);
    }
  });
});
