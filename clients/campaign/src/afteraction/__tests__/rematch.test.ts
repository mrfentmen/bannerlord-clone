/**
 * @vitest-environment jsdom
 *
 * "Fight again" / rematch (Buffy task 89).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReport,
  createRematchButton,
  createReportScreen,
  REMATCH_HINT_ID,
  type AfterActionData,
} from "../index.js";

const DATA: AfterActionData = {
  battleLabel: "Dry Fork",
  playerWon: true,
  durationS: 600,
  playerLosses: [{ unitKind: "infantry", started: 60, lost: 5 }],
  enemyLosses: [{ unitKind: "infantry", started: 100, lost: 70 }],
  playerKills: 70,
  enemyKills: 9,
  captures: [],
  timeline: [],
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("rematch button (task 89)", () => {
  it("is a real button that starts the fight again", () => {
    const onRematch = vi.fn();
    const handle = createRematchButton({ onRematch });
    document.body.appendChild(handle.root);

    expect(handle.button.tagName).toBe("BUTTON");
    expect(handle.button.getAttribute("type")).toBe("button");
    expect(handle.button.textContent).toBe("Fight again");

    handle.button.click();
    expect(onRematch).toHaveBeenCalledTimes(1);
  });

  it("fires once, even on a double click", () => {
    const onRematch = vi.fn();
    const handle = createRematchButton({ onRematch });
    document.body.appendChild(handle.root);

    handle.button.click();
    handle.button.click();
    handle.button.click();

    expect(onRematch).toHaveBeenCalledTimes(1);
    expect(handle.button.disabled).toBe(true);
  });

  it("names the opponent in the description, not in the button's name", () => {
    const handle = createRematchButton({ onRematch: () => {}, opponent: "the Vaylen company" });
    document.body.appendChild(handle.root);

    expect(handle.button.getAttribute("aria-describedby")).toBe(REMATCH_HINT_ID);
    const hint = document.getElementById(REMATCH_HINT_ID);
    expect(hint?.textContent).toBe("Same field, same enemy: the Vaylen company.");
    expect(handle.button.textContent).toBe("Fight again");
  });

  it("says nothing about an opponent when it was not told one", () => {
    const handle = createRematchButton({ onRematch: () => {} });
    document.body.appendChild(handle.root);

    expect(handle.button.hasAttribute("aria-describedby")).toBe(false);
    expect(handle.root.textContent).toBe("Fight again");
  });

  it("detaches cleanly", () => {
    const handle = createRematchButton({ onRematch: () => {} });
    document.body.appendChild(handle.root);
    handle.destroy();
    expect(document.querySelector('[data-testid="afteraction-rematch"]')).toBeNull();
  });
});

describe("rematch on the report screen (task 89)", () => {
  it("appears beside Continue when the caller can rematch", () => {
    const onRematch = vi.fn();
    const el = createReportScreen(buildReport(DATA, []), () => {}, { onRematch, rematchOpponent: "Vaylen" });
    document.body.appendChild(el);

    const btn = el.querySelector<HTMLButtonElement>('[data-testid="afteraction-rematch"]');
    expect(btn).not.toBeNull();
    expect(el.querySelector(".afteraction-close")?.textContent).toBe("Continue");
    btn?.click();
    expect(onRematch).toHaveBeenCalledTimes(1);
  });

  it("is absent when no rematch is possible", () => {
    const el = createReportScreen(buildReport(DATA, []), () => {});
    document.body.appendChild(el);

    expect(el.querySelector('[data-testid="afteraction-rematch"]')).toBeNull();
    // Closing the report still works: the rematch is an addition, not a replacement.
    expect(el.querySelector(".afteraction-close")).not.toBeNull();
  });

  it("still closes the report while the rematch is disabled", () => {
    const onRematch = vi.fn();
    const onClose = vi.fn();
    const el = createReportScreen(buildReport(DATA, []), onClose, { onRematch });
    document.body.appendChild(el);

    el.querySelector<HTMLButtonElement>('[data-testid="afteraction-rematch"]')?.click();
    el.querySelector<HTMLButtonElement>(".afteraction-close")?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});