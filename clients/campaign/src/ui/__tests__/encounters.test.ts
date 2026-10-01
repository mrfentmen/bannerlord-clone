/**
 * @vitest-environment jsdom
 *
 * Encounters UI: contact modal (82), party display + strength bar (83),
 * talk routing (84), trade routing (85), attack transition (86),
 * flee check with forced battle on failure (87), bribe slider + sim
 * accept/refuse with result before dismissal (88).
 */

import { describe, expect, it, vi } from "vitest";
import {
  createEncounterModal,
  type EncounterCallbacks,
  type EncounterState,
} from "../encounters.js";

function baseState(): EncounterState {
  return {
    encounterId: "enc-1",
    player: { id: "p1", name: "Iron Company", bossName: "Del", troops: 120, strength: 600, speed: 0.7, isPlayer: true },
    enemy: { id: "p2", name: "Rust Dogs", bossName: "Kessler", troops: 200, strength: 900, speed: 0.5, isPlayer: false },
    playerGold: 500,
  };
}

function baseCallbacks(overrides: Partial<EncounterCallbacks> = {}): EncounterCallbacks {
  return {
    onTalk: vi.fn(),
    onTrade: vi.fn(),
    onAttack: vi.fn(),
    onFlee: vi.fn().mockResolvedValue({ escaped: true, message: "You slip away into the streets." }),
    onBribe: vi.fn().mockResolvedValue({ accepted: true, goldTaken: 100, message: "Kessler takes the gold and waves you off." }),
    fetchDialogue: vi.fn().mockResolvedValue([{ speaker: "Kessler", text: "State your business." }]),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

function open(state: EncounterState = baseState(), cb?: EncounterCallbacks) {
  const callbacks = cb ?? baseCallbacks();
  const handle = createEncounterModal(state, callbacks);
  document.body.append(handle.root);
  return { handle, callbacks };
}

describe("encounter modal", () => {
  it("opens as a dialog with both parties and a strength bar", () => {
    const { handle } = open();
    expect(handle.root.getAttribute("role")).toBe("dialog");
    expect(handle.root.querySelector('[data-testid="party-p1"]')?.textContent).toContain("Iron Company");
    expect(handle.root.querySelector('[data-testid="party-p2"]')?.textContent).toContain("Rust Dogs");
    const bar = handle.root.querySelector(".encounter-strength");
    expect(bar).not.toBeNull();
    // Player 600 / (600 + 900) = 40%.
    expect(bar?.getAttribute("aria-label")).toContain("40 percent");
    handle.destroy();
  });

  it("shows all five action buttons", () => {
    const { handle } = open();
    for (const id of ["encounter-talk", "encounter-trade", "encounter-attack", "encounter-flee", "encounter-bribe"]) {
      expect(handle.root.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
    }
    handle.destroy();
  });

  it("update refreshes party data while open", () => {
    const { handle } = open();
    const next = baseState();
    next.enemy.troops = 50;
    handle.update(next);
    expect(handle.root.querySelector('[data-testid="party-p2"]')?.textContent).toContain("50 troops");
    handle.destroy();
  });

  it("talk fetches boss lines and renders the dialogue view", async () => {
    const callbacks = baseCallbacks();
    const { handle } = open(baseState(), callbacks);
    (handle.root.querySelector('[data-testid="encounter-talk"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(callbacks.fetchDialogue).toHaveBeenCalledWith("Kessler");
    expect(callbacks.onTalk).toHaveBeenCalledWith("Kessler");
    const dlg = handle.root.querySelector('[data-testid="encounter-dialogue"]');
    expect(dlg?.textContent).toContain("State your business.");
    handle.destroy();
  });

  it("talk falls back gracefully when the sim fails", async () => {
    const callbacks = baseCallbacks({ fetchDialogue: vi.fn().mockRejectedValue(new Error("down")) });
    const { handle } = open(baseState(), callbacks);
    (handle.root.querySelector('[data-testid="encounter-talk"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.root.querySelector('[data-testid="encounter-dialogue"]')?.textContent).toContain("Make it quick");
    handle.destroy();
  });

  it("trade routes to the market panel and dismisses", () => {
    const callbacks = baseCallbacks();
    const { handle } = open(baseState(), callbacks);
    (handle.root.querySelector('[data-testid="encounter-trade"]') as HTMLButtonElement).click();
    expect(callbacks.onTrade).toHaveBeenCalledWith("enc-1");
    expect(callbacks.onDismiss).toHaveBeenCalledWith("enc-1", "traded");
    expect(document.body.contains(handle.root)).toBe(false);
  });

  it("attack transitions to the battle scene and dismisses", () => {
    const callbacks = baseCallbacks();
    const { handle } = open(baseState(), callbacks);
    (handle.root.querySelector('[data-testid="encounter-attack"]') as HTMLButtonElement).click();
    expect(callbacks.onAttack).toHaveBeenCalledWith("enc-1");
    expect(callbacks.onDismiss).toHaveBeenCalledWith("enc-1", "attacked");
    expect(document.body.contains(handle.root)).toBe(false);
  });

  it("successful flee shows the result then dismisses as fled", async () => {
    const callbacks = baseCallbacks();
    const { handle } = open(baseState(), callbacks);
    (handle.root.querySelector('[data-testid="encounter-flee"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    const result = handle.root.querySelector('[data-testid="encounter-result"]');
    expect(result?.textContent).toContain("slip away");
    (handle.root.querySelector('[data-testid="encounter-result-dismiss"]') as HTMLButtonElement).click();
    expect(callbacks.onDismiss).toHaveBeenCalledWith("enc-1", "fled");
    expect(callbacks.onAttack).not.toHaveBeenCalled();
    expect(document.body.contains(handle.root)).toBe(false);
  });

  it("failed flee forces the battle", async () => {
    const callbacks = baseCallbacks({
      onFlee: vi.fn().mockResolvedValue({ escaped: false, message: "They cut off your retreat." }),
    });
    const { handle } = open(baseState(), callbacks);
    (handle.root.querySelector('[data-testid="encounter-flee"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.root.querySelector('[data-testid="encounter-result"]')?.textContent).toContain("cut off");
    (handle.root.querySelector('[data-testid="encounter-result-dismiss"]') as HTMLButtonElement).click();
    expect(callbacks.onAttack).toHaveBeenCalledWith("enc-1");
    expect(callbacks.onDismiss).toHaveBeenCalledWith("enc-1", "attacked");
  });

  it("bribe slider defaults within player gold and shows the offer", () => {
    const { handle } = open();
    (handle.root.querySelector('[data-testid="encounter-bribe"]') as HTMLButtonElement).click();
    const slider = handle.root.querySelector('[data-testid="bribe-slider"]') as HTMLInputElement;
    expect(slider.max).toBe("500");
    expect(Number(slider.value)).toBeLessThanOrEqual(500);
    slider.value = "250";
    slider.dispatchEvent(new Event("input"));
    expect(handle.root.querySelector('[data-testid="bribe-amount"]')?.textContent).toBe("250g");
    handle.destroy();
  });

  it("accepted bribe shows the result before dismissal", async () => {
    const callbacks = baseCallbacks();
    const { handle } = open(baseState(), callbacks);
    (handle.root.querySelector('[data-testid="encounter-bribe"]') as HTMLButtonElement).click();
    (handle.root.querySelector('[data-testid="bribe-offer"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    // The result is visible while the modal is still open.
    expect(document.body.contains(handle.root)).toBe(true);
    expect(handle.root.querySelector('[data-testid="encounter-result"]')?.textContent).toContain("takes the gold");
    expect(callbacks.onBribe).toHaveBeenCalledWith("enc-1", 100);
    (handle.root.querySelector('[data-testid="encounter-result-dismiss"]') as HTMLButtonElement).click();
    expect(callbacks.onDismiss).toHaveBeenCalledWith("enc-1", "bribed");
    expect(document.body.contains(handle.root)).toBe(false);
  });

  it("refused bribe returns to the options view", async () => {
    const callbacks = baseCallbacks({
      onBribe: vi.fn().mockResolvedValue({ accepted: false, goldTaken: 0, message: "Kessler laughs in your face." }),
    });
    const { handle } = open(baseState(), callbacks);
    (handle.root.querySelector('[data-testid="encounter-bribe"]') as HTMLButtonElement).click();
    (handle.root.querySelector('[data-testid="bribe-offer"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.root.querySelector('[data-testid="encounter-result"]')?.textContent).toContain("laughs");
    (handle.root.querySelector('[data-testid="encounter-result-dismiss"]') as HTMLButtonElement).click();
    // Back at the options; nothing dismissed.
    expect(handle.root.querySelector('[data-testid="encounter-attack"]')).not.toBeNull();
    expect(callbacks.onDismiss).not.toHaveBeenCalled();
    handle.destroy();
  });
});
