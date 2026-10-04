/**
 * Tests for the ambience manager: one bed per location, no accidental silence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAmbienceManager } from "../ambienceManager.js";
import { getAudioManager } from "../AudioManager.js";

vi.mock("../AudioManager.js", () => {
  const playAmbient = vi.fn().mockResolvedValue(undefined);
  const stopAmbient = vi.fn();
  return {
    getAudioManager: () => ({ playAmbient, stopAmbient }),
  };
});

describe("AmbienceManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("plays the bed for a location", () => {
    const mgr = getAmbienceManager();
    mgr.setLocation("tavern");
    expect(getAudioManager().playAmbient).toHaveBeenCalledWith("sfx-ambience-tavern-interior");
  });

  it("does not replay the same location", () => {
    const mgr = getAmbienceManager();
    mgr.setLocation("forest");
    const calls = (getAudioManager().playAmbient as any).mock.calls.length;
    mgr.setLocation("forest");
    expect((getAudioManager().playAmbient as any).mock.calls.length).toBe(calls);
  });

  it("switches beds between locations", () => {
    const mgr = getAmbienceManager();
    mgr.setLocation("town-day");
    mgr.setLocation("town-night");
    const calls = (getAudioManager().playAmbient as any).mock.calls;
    expect(calls[calls.length - 1][0]).toBe("sfx-ambience-town-night");
  });

  it("stops the bed on stop()", () => {
    const mgr = getAmbienceManager();
    mgr.setLocation("dungeon");
    mgr.stop();
    expect(getAudioManager().stopAmbient).toHaveBeenCalled();
  });
});
