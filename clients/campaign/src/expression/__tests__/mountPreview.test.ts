/** Task 134: all mount types are viewable. */

import { describe, expect, it } from "vitest";
import { createMountViewer, currentMount, MOUNT_TYPES, nextMount, prevMount } from "../mountPreview.js";

describe("mount preview (task 134)", () => {
  it("cycles through every mount type and wraps", () => {
    let v = createMountViewer();
    const seen = new Set<string>();
    for (let i = 0; i < MOUNT_TYPES.length; i++) {
      seen.add(currentMount(v).id);
      v = nextMount(v);
    }
    expect(seen.size).toBe(MOUNT_TYPES.length);
    expect(currentMount(v).id).toBe(MOUNT_TYPES[0]!.id);
  });

  it("steps back", () => {
    const v = prevMount(createMountViewer());
    expect(currentMount(v).id).toBe(MOUNT_TYPES[MOUNT_TYPES.length - 1]!.id);
  });

  it("every type has stats", () => {
    for (const m of MOUNT_TYPES) {
      expect(m.speed).toBeGreaterThan(0);
      expect(m.capacity).toBeGreaterThanOrEqual(0);
    }
  });
});
