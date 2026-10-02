/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { createBattleAnnouncer, mountAnnouncer } from "../announcer.js";

describe("screen-reader battle announcements (solo task 18)", () => {
  it("exposes a polite live region", () => {
    const a = createBattleAnnouncer();
    expect(a.region.getAttribute("aria-live")).toBe("polite");
    expect(a.region.getAttribute("role")).toBe("status");
  });

  it("batches rapid kills into one announcement", () => {
    let t = 0;
    const a = createBattleAnnouncer(() => t);
    a.kill("raider", false);
    a.kill("raider", false);
    a.kill("militia", true);
    // Still batching: nothing announced yet.
    expect(a.region.textContent).toBe("");
    t += 3000;
    a.kill("raider", false); // crosses the batch window -> flush
    expect(a.region.textContent).toBe("3 enemies down, 1 ally lost.");
  });

  it("announces objectives and results immediately", () => {
    const a = createBattleAnnouncer();
    a.objective("Defend the ridge");
    expect(a.region.textContent).toBe("Objective: Defend the ridge");
    a.result("Victory — the enemy routs");
    expect(a.region.textContent).toBe("Battle over: Victory — the enemy routs");
  });

  it("flushes pending kills before an objective", () => {
    const a = createBattleAnnouncer();
    a.kill("raider", false);
    a.objective("Hold the bridge");
    // flushKills ran first, then the objective overwrote it.
    expect(a.region.textContent).toBe("Objective: Hold the bridge");
    a.flush();
    expect(a.region.textContent).toBe("Objective: Hold the bridge");
  });

  it("mounts into a battle UI root", () => {
    const root = document.createElement("div");
    const a = createBattleAnnouncer();
    mountAnnouncer(root, a);
    expect(root.querySelector('[data-testid="battle-announcer"]')).toBe(a.region);
  });
});
