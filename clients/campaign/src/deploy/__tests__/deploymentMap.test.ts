/**
 * DeploymentMap DOM smoke test: opens, renders the roster, closes cleanly.
 * Canvas 2D is a no-op under jsdom; the pure rendering math is covered in
 * terrain.test.ts.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { openDeployment } from "../DeploymentMap.js";
import { samplePatch } from "../terrain.js";
import type { RosterUnit } from "../types.js";

const ROSTER: RosterUnit[] = [
  { id: "a", label: "Alpha", kind: "infantry", count: 100, radius_m: 30 },
  { id: "b", label: "Beta", kind: "cavalry", count: 40, radius_m: 35 },
];

describe("openDeployment", () => {
  it("renders a roster card per unit and a preview banner for preview patches", () => {
    const onChange = vi.fn();
    const handle = openDeployment({ patch: samplePatch(), roster: ROSTER, onChange });
    document.body.append(handle.root);

    const cards = handle.root.querySelectorAll(".deploy__card");
    expect(cards).toHaveLength(2);
    expect(handle.root.querySelector(".deploy__preview")?.textContent).toMatch(/PREVIEW TERRAIN/);
    expect(handle.root.querySelector(".deploy__canvas")).not.toBeNull();
    // Nothing placed yet.
    expect(handle.getPlacements()).toEqual([]);
    expect(onChange).toHaveBeenCalledWith([]);

    handle.close();
    expect(handle.root.isConnected).toBe(false);
  });

  it("closes through the Done button and reports placements", () => {
    const onConfirm = vi.fn();
    const handle = openDeployment({ patch: samplePatch(), roster: ROSTER, onConfirm });
    document.body.append(handle.root);
    (handle.root.querySelector(".deploy__footer .btn--primary") as HTMLButtonElement).click();
    expect(onConfirm).toHaveBeenCalledWith([]);
    expect(handle.root.isConnected).toBe(false);
  });
});
