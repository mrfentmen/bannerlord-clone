import { describe, expect, it, vi } from "vitest";
import type { AudioManager, SfxId } from "../AudioManager.js";
import { TOWN_DAY_BED } from "../ambientBeds.js";
import { applySelectionAmbient } from "../selectionAmbient.js";

describe("selection ambient (task 571)", () => {
  it("plays the real town-day bed when a simulated town is selected", () => {
    const playAmbient = vi.fn(async (_id: SfxId) => {});
    const stopAmbient = vi.fn();
    const audio = { playAmbient, stopAmbient } as unknown as AudioManager;

    applySelectionAmbient(audio, { townSelected: true });

    expect(playAmbient).toHaveBeenCalledWith(TOWN_DAY_BED);
    expect(stopAmbient).not.toHaveBeenCalled();
  });

  it("stops ambience when the selected place has no town", () => {
    const playAmbient = vi.fn(async (_id: SfxId) => {});
    const stopAmbient = vi.fn();
    const audio = { playAmbient, stopAmbient } as unknown as AudioManager;

    applySelectionAmbient(audio, { townSelected: false });

    expect(playAmbient).not.toHaveBeenCalled();
    expect(stopAmbient).toHaveBeenCalledOnce();
  });
});
