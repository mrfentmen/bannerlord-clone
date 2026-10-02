/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  canRally,
  createRallyState,
  RALLY_COOLDOWN_MS,
  RALLY_MORALE_BOOST,
  rallyCooldownLabel,
  rallyCooldownRemaining,
  useRally,
} from "../rally.js";
import { rallyButton } from "../rallyButton.js";

describe("mid-battle rally (solo task 23)", () => {
  it("starts ready with two uses", () => {
    const s = createRallyState();
    expect(canRally(s, 0)).toBe(true);
    expect(rallyCooldownLabel(s, 0)).toBe("Ready");
  });

  it("grants the morale boost and starts the cooldown", () => {
    const s = createRallyState();
    expect(useRally(s, 1000)).toBe(RALLY_MORALE_BOOST);
    expect(canRally(s, 1000)).toBe(false);
    expect(rallyCooldownRemaining(s, 1000)).toBe(RALLY_COOLDOWN_MS);
    expect(rallyCooldownLabel(s, 1000)).toBe("1:30");
  });

  it("becomes ready again after the cooldown", () => {
    const s = createRallyState();
    useRally(s, 0);
    expect(canRally(s, RALLY_COOLDOWN_MS)).toBe(true);
    expect(useRally(s, RALLY_COOLDOWN_MS)).toBe(RALLY_MORALE_BOOST);
  });

  it("is spent after two uses", () => {
    const s = createRallyState();
    useRally(s, 0);
    useRally(s, RALLY_COOLDOWN_MS);
    expect(canRally(s, RALLY_COOLDOWN_MS * 2)).toBe(false);
    expect(useRally(s, RALLY_COOLDOWN_MS * 2)).toBeNull();
    expect(rallyCooldownLabel(s, RALLY_COOLDOWN_MS * 2)).toBe("Spent");
  });

  it("button shows cooldown and fires onRally", () => {
    let now = 0;
    const onRally = vi.fn();
    const btn = rallyButton({ state: createRallyState(), nowMs: () => now, onRally });
    expect(btn.textContent).toBe("Rally (Ready)");
    (btn as HTMLButtonElement).click();
    expect(onRally).toHaveBeenCalledWith(RALLY_MORALE_BOOST);
    expect(btn.textContent).toBe("Rally (1:30)");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    now = RALLY_COOLDOWN_MS;
    (btn as unknown as { refreshRally: () => void }).refreshRally();
    expect(btn.textContent).toBe("Rally (Ready)");
  });
});
