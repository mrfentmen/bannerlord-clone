/**
 * @vitest-environment jsdom
 *
 * Enemy commander captured (Buffy task 93).
 *
 * The fixtures are real `Rival` records in the shape `trackRival()` returns, so
 * the wording is checked against the record the campaign actually keeps rather
 * than a shape invented for the test.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { capturedCommander, createCommanderPanel } from "../commanderEvents.js";
import type { Rival } from "../../battleflow/rivals.js";

const CAPTURED: Rival = {
  id: "party-vaylen",
  name: "Marek Dain",
  faction: "the Vaylen company",
  escapes: 2,
  encounters: 3,
  firstSeen: 1000,
  lastSeen: 2000,
  defeated: true,
};

const FIRST_SIGHTING: Rival = { ...CAPTURED, name: "Ilse Kray", encounters: 1, escapes: 0 };

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("captured commander (task 93)", () => {
  it("states the capture and how often the commander had to be fought", () => {
    const event = capturedCommander(CAPTURED);
    expect(event.line).toBe("Marek Dain of the Vaylen company was taken prisoner — fought 3 times before.");
    expect(event.encounters).toBe(3);
    expect(event.name).toBe("Marek Dain");
  });

  it("does not pluralise a commander's first appearance", () => {
    expect(capturedCommander(FIRST_SIGHTING).line).toContain("fought once before");
  });

  it("reads the record's own fields rather than counting them again", () => {
    const event = capturedCommander({ ...CAPTURED, encounters: 5 });
    expect(event.encounters).toBe(5);
    expect(event.line).toContain("fought 5 times before");
  });

  it("keeps the commander's id, so the campaign can find the record again", () => {
    expect(capturedCommander(CAPTURED).id).toBe("party-vaylen");
  });
});

describe("commander panel (task 93)", () => {
  it("shows the capture as a notice with a name", () => {
    const panel = createCommanderPanel(capturedCommander(CAPTURED));
    document.body.appendChild(panel.root);

    expect(panel.root.hidden).toBe(false);
    expect(panel.root.getAttribute("aria-label")).toBe("Enemy commander");
    expect(panel.root.querySelector(".aa-commander__name")?.textContent).toBe("Marek Dain");
    expect(panel.root.querySelector(".aa-commander__line")?.textContent).toBe(
      "Marek Dain of the Vaylen company was taken prisoner — fought 3 times before.",
    );
  });

  it("shows nothing when there was no commander to report", () => {
    const panel = createCommanderPanel(null);
    document.body.appendChild(panel.root);

    expect(panel.root.hidden).toBe(true);
    expect(panel.root.textContent).toBe("");
    expect(panel.event()).toBeNull();
  });

  it("exposes the event it rendered", () => {
    const panel = createCommanderPanel(capturedCommander(CAPTURED));
    expect(panel.event()?.name).toBe("Marek Dain");
  });

  it("detaches cleanly", () => {
    const panel = createCommanderPanel(capturedCommander(CAPTURED));
    document.body.appendChild(panel.root);
    panel.destroy();
    expect(document.querySelector('[data-testid="aa-commander"]')).toBeNull();
  });
});