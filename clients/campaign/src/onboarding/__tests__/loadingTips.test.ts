/**
 * @vitest-environment jsdom
 *
 * Loading tips rotation (MASTER_PLAN task 125): tips shown during loads, and
 * no tip repeats within ten loads — across reloads, not just in-session.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createTipRotator,
  LOADING_TIPS,
  TIP_HISTORY_WINDOW,
  TIP_STORE_KEY,
  type TipStorage,
} from "../loadingTips.js";
import { startScreen } from "../../ui/panels/StartScreen.js";

/** Deterministic rng: always picks the first candidate. */
const first = () => 0;

function fakeStorage(initial: Record<string, string> = {}): TipStorage & {
  writes: string[];
  throwOnWrite: boolean;
} {
  const data = new Map(Object.entries(initial));
  return {
    writes: [],
    throwOnWrite: false,
    getItem: (k: string) => data.get(k) ?? null,
    setItem(k: string, v: string) {
      if (this.throwOnWrite) throw new Error("blocked");
      this.writes.push(k);
      data.set(k, v);
    },
  };
}

describe("tip corpus", () => {
  it("has unique ids, non-empty text, and more than twice the history window", () => {
    const ids = LOADING_TIPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tip of LOADING_TIPS) {
      expect(tip.text.trim().length).toBeGreaterThan(0);
    }
    expect(LOADING_TIPS.length).toBeGreaterThan(TIP_HISTORY_WINDOW * 2);
  });
});

describe("next() — the no-repeat window", () => {
  it("shows no repeat within ten consecutive loads", () => {
    const storage = fakeStorage();
    const rotator = createTipRotator(storage, LOADING_TIPS, first);
    const shown = Array.from({ length: 30 }, () => rotator.next().id);
    for (let start = 0; start + TIP_HISTORY_WINDOW <= shown.length; start++) {
      const window = shown.slice(start, start + TIP_HISTORY_WINDOW);
      expect(new Set(window).size).toBe(TIP_HISTORY_WINDOW);
    }
  });

  it("keeps the window across reloads via storage", () => {
    const storage = fakeStorage();
    const firstSession = createTipRotator(storage, LOADING_TIPS, first);
    const firstTip = firstSession.next();
    expect(firstTip.id).toBe(LOADING_TIPS[0]!.id);

    // Second "load": a brand-new rotator on the same storage must not
    // repeat the tip the first session showed.
    const secondSession = createTipRotator(storage, LOADING_TIPS, first);
    expect(secondSession.recent()).toContain(firstTip.id);
    expect(secondSession.next().id).not.toBe(firstTip.id);
  });

  it("records the window to storage on every load", () => {
    const storage = fakeStorage();
    const rotator = createTipRotator(storage, LOADING_TIPS, first);
    rotator.next();
    rotator.next();
    const raw = storage.getItem(TIP_STORE_KEY);
    expect(raw).not.toBeNull();
    const ids = JSON.parse(raw!) as string[];
    expect(ids).toEqual([LOADING_TIPS[0]!.id, LOADING_TIPS[1]!.id]);
  });

  it("recovers from corrupt storage without crashing", () => {
    const storage = fakeStorage({ [TIP_STORE_KEY]: "not-json{{{" });
    const rotator = createTipRotator(storage, LOADING_TIPS, first);
    const tip = rotator.next();
    expect(LOADING_TIPS.some((t) => t.id === tip.id)).toBe(true);
  });

  it("recovers from non-array storage without crashing", () => {
    const storage = fakeStorage({ [TIP_STORE_KEY]: JSON.stringify({ nope: true }) });
    const rotator = createTipRotator(storage, LOADING_TIPS, first);
    expect(() => rotator.next()).not.toThrow();
  });

  it("ignores unknown tip ids left in storage by an older corpus", () => {
    const storage = fakeStorage({
      [TIP_STORE_KEY]: JSON.stringify(["tip-retired", LOADING_TIPS[0]!.id]),
    });
    const rotator = createTipRotator(storage, LOADING_TIPS, first);
    expect(rotator.recent()).toEqual([LOADING_TIPS[0]!.id]);
    expect(rotator.next().id).not.toBe(LOADING_TIPS[0]!.id);
  });

  it("works with null storage (in-memory window for the session)", () => {
    const rotator = createTipRotator(null, LOADING_TIPS, first);
    const shown = Array.from({ length: 12 }, () => rotator.next().id);
    expect(new Set(shown.slice(0, TIP_HISTORY_WINDOW)).size).toBe(TIP_HISTORY_WINDOW);
  });

  it("keeps working when storage writes are blocked", () => {
    const storage = fakeStorage();
    storage.throwOnWrite = true;
    const rotator = createTipRotator(storage, LOADING_TIPS, first);
    const tip = rotator.next();
    expect(LOADING_TIPS.some((t) => t.id === tip.id)).toBe(true);
    expect(rotator.recent()).toContain(tip.id);
  });
});

describe("nextInSession() — in-screen rotation", () => {
  it("never repeats the tip currently showing", () => {
    const rotator = createTipRotator(null, LOADING_TIPS, first);
    let current = rotator.next();
    for (let i = 0; i < 50; i++) {
      const next = rotator.nextInSession(current);
      expect(next.id).not.toBe(current.id);
      current = next;
    }
  });

  it("does not touch the persisted load window", () => {
    const storage = fakeStorage();
    const rotator = createTipRotator(storage, LOADING_TIPS, first);
    const current = rotator.next();
    rotator.nextInSession(current);
    rotator.nextInSession(current);
    expect(rotator.recent()).toEqual([current.id]);
  });
});

describe("start-screen loading tip (task 125 wiring)", () => {
  it("renders a tip under the skeleton and rotates it without immediate repeat", () => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
    try {
      const screen = startScreen({
        settlements: [],
        startYear: 2026,
        eraLabel: "test era",
        loading: true,
        onStart: () => {},
      });
      document.body.appendChild(screen);
      const tip = screen.querySelector('[data-testid="loading-tip"]');
      expect(tip).not.toBeNull();
      expect(tip!.closest("aside")?.getAttribute("aria-live")).toBe("polite");
      const first = tip!.textContent ?? "";
      expect(LOADING_TIPS.some((t) => t.text === first)).toBe(true);
      vi.advanceTimersByTime(5000);
      const second = tip!.textContent ?? "";
      expect(second).not.toBe(first);
      expect(LOADING_TIPS.some((t) => t.text === second)).toBe(true);
      screen.remove();
    } finally {
      vi.useRealTimers();
      document.body.innerHTML = "";
    }
  });
});
