/**
 * @vitest-environment jsdom
 */
/**
 * Tasks 545/546: a new notice in the feed gets a pop, a critical one an alert.
 *
 * The diff is pure; the sound is observed on the `AudioManager` singleton, so
 * the test covers the same path a live tick takes.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { Notification } from "../../data/types.js";
import { getAudioManager } from "../AudioManager.js";
import { noticeCueFor, playNoticeCue } from "../noticePop.js";

function notice(id: string, priority: Notification["priority"] = "informational"): Notification {
  return { id, day: 1, priority, text: id, entityId: null, field: null };
}

let spy: MockInstance;

beforeEach(() => {
  spy = vi
    .spyOn(getAudioManager(), "playSfx")
    .mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notification feed cues (tasks 545/546)", () => {
  it("is silent when the feed has nothing new", () => {
    const feed = [notice("a"), notice("b")];
    expect(noticeCueFor(feed, feed)).toBe("none");
    playNoticeCue(feed, feed);
    expect(spy).not.toHaveBeenCalled();
  });

  it("pops for a new ordinary notice", () => {
    expect(noticeCueFor([notice("a")], [notice("a"), notice("b")])).toBe("pop");
    playNoticeCue([notice("a")], [notice("a"), notice("b")]);
    expect(spy).toHaveBeenCalledWith("sfx-radio-blip", { volume: 0.5 });
  });

  it("alerts for a new critical notice", () => {
    const before = [notice("a")];
    const after = [notice("a"), notice("b", "critical")];
    expect(noticeCueFor(before, after)).toBe("alert");
    playNoticeCue(before, after);
    expect(spy).toHaveBeenCalledWith("sfx-ui-error", { volume: 0.5 });
  });

  it("alerts once when a batch carries a critical notice, not twice", () => {
    const before = [notice("a")];
    const after = [notice("a"), notice("b"), notice("c", "critical")];
    playNoticeCue(before, after);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("sfx-ui-error", { volume: 0.5 });
  });

  it("stays silent for the initial feed", () => {
    playNoticeCue(null, [notice("a"), notice("b", "critical")]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not re-pop for an id it has already seen", () => {
    playNoticeCue([notice("a")], [notice("a"), { ...notice("b") }]);
    spy.mockClear();
    playNoticeCue([notice("a"), notice("b")], [notice("a"), notice("b")]);
    expect(spy).not.toHaveBeenCalled();
  });
});
