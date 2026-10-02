/**
 * @vitest-environment jsdom
 *
 * Achievement unlock toasts (Buffy task 91).
 *
 * The store's own unlock logic is covered in src/achievements/__tests__; this
 * covers the presentation and the timer hygiene, using real definitions from the
 * real catalogue so no achievement is invented here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACHIEVEMENT_TOAST_MS, showAchievementToasts } from "../achievementToast.js";
import { ACHIEVEMENT_DEFS } from "../../achievements/catalog.js";
import { createAchievementStore } from "../../achievements/store.js";
import type { AchievementDef } from "../../achievements/types.js";

const FIRST = ACHIEVEMENT_DEFS[0]!;
const SECOND = ACHIEVEMENT_DEFS[1]!;

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("achievement toasts (task 91)", () => {
  it("states what was unlocked, with its points and category", () => {
    const toasts = showAchievementToasts({ unlocked: [FIRST] });
    document.body.appendChild(toasts.root);

    expect(toasts.root.hidden).toBe(false);
    const card = toasts.root.querySelector(".aa-ach-toast");
    expect(card?.textContent).toContain(`Achievement unlocked: ${FIRST.title}`);
    expect(card?.textContent).toContain(FIRST.description);
    expect(card?.textContent).toContain(`${FIRST.points} points`);
    expect(card?.getAttribute("data-achievement-id")).toBe(FIRST.id);
  });

  it("announces politely rather than interrupting", () => {
    const toasts = showAchievementToasts({ unlocked: [FIRST] });
    expect(toasts.root.getAttribute("role")).toBe("status");
    expect(toasts.root.getAttribute("aria-live")).toBe("polite");
  });

  it("stacks every achievement the battle unlocked", () => {
    const toasts = showAchievementToasts({ unlocked: [FIRST, SECOND] });
    document.body.appendChild(toasts.root);

    expect(toasts.shown().map((d) => d.id)).toEqual([FIRST.id, SECOND.id]);
    expect(toasts.root.querySelectorAll(".aa-ach-toast")).toHaveLength(2);
  });

  it("says nothing when nothing was unlocked", () => {
    const toasts = showAchievementToasts({ unlocked: [] });
    document.body.appendChild(toasts.root);

    expect(toasts.root.hidden).toBe(true);
    expect(toasts.root.textContent).toBe("");
    expect(toasts.shown()).toEqual([]);
  });

  it("dismisses itself on a timer", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const toasts = showAchievementToasts({ unlocked: [FIRST] });
    document.body.appendChild(toasts.root);

    vi.advanceTimersByTime(ACHIEVEMENT_TOAST_MS - 1);
    expect(document.querySelectorAll(".aa-ach-toast")).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(document.querySelectorAll(".aa-ach-toast")).toHaveLength(0);
    // The container stays until the caller lets it go; only the cards leave.
    expect(document.querySelector('[data-testid="aa-ach-toasts"]')).not.toBeNull();
  });

  it("takes a dismissal timeout", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const toasts = showAchievementToasts({ unlocked: [FIRST], timeoutMs: 100 });
    document.body.appendChild(toasts.root);

    vi.advanceTimersByTime(100);
    expect(document.querySelectorAll(".aa-ach-toast")).toHaveLength(0);
  });

  it("clears its timers on destroy, so a closed report announces nothing later", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const toasts = showAchievementToasts({ unlocked: [FIRST, SECOND] });
    document.body.appendChild(toasts.root);
    expect(vi.getTimerCount()).toBe(2);

    toasts.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('[data-testid="aa-ach-toasts"]')).toBeNull();
  });

  it("displays whatever the real store says it unlocked", () => {
    const store = createAchievementStore(localStorage, () => 12);
    const unlocked: AchievementDef[] = store.record(FIRST.event);
    // The store also counts the unlock itself against its meta achievement, so a
    // first unlock really does come back as more than one definition.
    expect(unlocked.map((d) => d.id)).toContain(FIRST.id);
    expect(unlocked.length).toBeGreaterThan(1);

    const toasts = showAchievementToasts({ unlocked });
    document.body.appendChild(toasts.root);
    expect(toasts.shown()).toHaveLength(unlocked.length);
    expect(toasts.root.querySelector(".aa-ach-toast__title")?.textContent).toBe(
      `Achievement unlocked: ${unlocked[0]!.title}`,
    );

    // The same event again unlocks nothing, so there is nothing to announce.
    expect(store.record(FIRST.event)).toEqual([]);
  });
});