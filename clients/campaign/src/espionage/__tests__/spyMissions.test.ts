/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  assignMission,
  cancelMission,
  MISSION_ICONS,
  spyMapMarkers,
  spyMission,
  SPY_MISSIONS,
} from "../spyMissions.js";

beforeEach(() => localStorage.clear());

const spies = [
  { id: "s1", name: "Whisper", post: "harbor", cover: 70 },
  { id: "s2", name: "Moth", post: "docks", cover: 20 },
];

describe("spy assignment map view (solo task 61)", () => {
  it("assigns missions with icons", () => {
    assignMission("s1", "sabotage", 30);
    expect(spyMission("s1")?.kind).toBe("sabotage");
    expect(MISSION_ICONS["sabotage"]).toBe("✸");
  });

  it("has five mission kinds", () => {
    expect(SPY_MISSIONS).toHaveLength(5);
  });

  it("markers show spies with mission icons", () => {
    assignMission("s1", "gather-intel", 30);
    const markers = spyMapMarkers(spies, { harbor: "Harbor", docks: "Docks" });
    expect(markers).toHaveLength(2);
    const m1 = markers.find((m) => m.spyId === "s1")!;
    expect(m1.icon).toBe(MISSION_ICONS["gather-intel"]);
    expect(m1.postName).toBe("Harbor");
    // No mission: idle icon.
    const m2 = markers.find((m) => m.spyId === "s2")!;
    expect(m2.mission).toBeNull();
    expect(m2.icon).toBe("○");
    expect(m2.atRisk).toBe(true);
  });

  it("reassigning replaces the mission", () => {
    assignMission("s1", "sabotage", 30);
    assignMission("s1", "steal-plans", 40);
    expect(spyMission("s1")?.kind).toBe("steal-plans");
  });

  it("cancel clears the mission", () => {
    assignMission("s1", "sabotage", 30);
    cancelMission("s1");
    expect(spyMission("s1")).toBeNull();
  });

  it("unknown missions throw", () => {
    expect(() => assignMission("s1", "nope" as never, 30)).toThrow("unknown spy mission");
  });
});
