/**
 * The objectives panel (mandate §12): renders live objectives with progress and
 * completion marks.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { objectivesPanel } from "../panels/ObjectivesPanel.js";
import type { Objective } from "../../data/objectives.js";

const OBJECTIVES: Objective[] = [
  { id: "muster", title: "Muster a warband", description: "Recruit.", progress: 4, target: 10, completed: false },
  { id: "war-chest", title: "Fill the war chest", description: "Earn.", progress: 1000, target: 1000, completed: true },
];

describe("objectivesPanel", () => {
  it("renders every objective with progress and marks the completed one", () => {
    const { root } = objectivesPanel({ objectives: OBJECTIVES, onClose: () => {} });
    document.body.replaceChildren(root);
    expect(root.querySelector('[data-testid="objective-muster"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="objective-war-chest"]')).not.toBeNull();
    // Progress gauge shows 4 / 10 for the incomplete one.
    expect(root.querySelector('[data-testid="objective-gauge-muster"]')!.textContent).toContain("4 / 10");
    // The completed one shows Done, not a gauge.
    expect(root.querySelector('[data-testid="objective-war-chest"]')!.textContent).toContain("✓ Complete");
    expect(root.querySelector('[data-testid="objective-gauge-war-chest"]')).toBeNull();
    // Summary counts completions.
    expect(root.textContent).toContain("1 of 2 complete");
  });
});
