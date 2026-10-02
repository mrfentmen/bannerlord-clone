/** Task 119: hideout upgrades give concrete bonuses. */

import { describe, expect, it } from "vitest";
import { activeBonuses, createHideout, installUpgrade } from "../hideout.js";

describe("hideout management (task 119)", () => {
  it("installs upgrades with concrete bonuses", () => {
    const h = createHideout();
    const u = installUpgrade(h, "walls");
    expect(u!.bonus).toBe("+30 hideout defense");
    expect(activeBonuses(h)).toEqual(["+30 hideout defense"]);
  });

  it("refuses duplicate installs", () => {
    const h = createHideout();
    installUpgrade(h, "tunnels");
    expect(installUpgrade(h, "tunnels")).toBeNull();
    expect(h.installed).toHaveLength(1);
  });
});
