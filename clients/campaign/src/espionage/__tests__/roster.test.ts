/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { adjustCover, placeSpy, placedSpies, recallSpy, spyRoster } from "../roster.js";
import { answerAlert, fileAlert, pendingAlerts, raiseAlert } from "../spyAlerts.js";

beforeEach(() => localStorage.clear());

describe("spy roster (integration)", () => {
  it("places, lists, and recalls spies", () => {
    placeSpy({ id: "s1", name: "Rook", post: "kings-landing", cover: 60, skill: 5 });
    expect(spyRoster()).toHaveLength(1);
    expect(placedSpies()[0]).toMatchObject({ id: "s1", name: "Rook" });
    expect(recallSpy("s1")).toBe(true);
    expect(recallSpy("s1")).toBe(false);
    expect(spyRoster()).toHaveLength(0);
  });

  it("rejects duplicate ids and clamps cover", () => {
    placeSpy({ id: "s1", name: "Rook", post: "p", cover: 60, skill: 5 });
    expect(() => placeSpy({ id: "s1", name: "Copy", post: "p", cover: 60, skill: 5 })).toThrow();
    expect(adjustCover("s1", 999)!.cover).toBe(100);
    expect(adjustCover("s1", -999)!.cover).toBe(0);
    expect(adjustCover("ghost", 10)).toBeNull();
  });

  it("persists across loads", () => {
    placeSpy({ id: "s1", name: "Rook", post: "p", cover: 60, skill: 5 });
    expect(spyRoster()[0]!.name).toBe("Rook");
  });
});

describe("spy alert inbox (integration)", () => {
  it("files, lists, and answers alerts", () => {
    const alert = raiseAlert("Varys", "kings-landing", "King's Landing", 80);
    fileAlert(alert);
    expect(pendingAlerts()).toHaveLength(1);
    const resolution = answerAlert(alert.id, "arrest", 42);
    expect(resolution).not.toBeNull();
    expect(resolution!.response).toBe("arrest");
    expect(pendingAlerts()).toHaveLength(0);
    // Answering twice is a no-op.
    expect(answerAlert(alert.id, "arrest", 42)).toBeNull();
  });
});
