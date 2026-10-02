/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { INTRO_BEATS, createIntroStory } from "../introStory.js";
import { introStoryPanel } from "../introStoryPanel.js";

describe("intro story (solo task 5)", () => {
  it("has four beats covering setting, vacuum, clan and goal", () => {
    expect(INTRO_BEATS.length).toBe(4);
    expect(INTRO_BEATS.map((b) => b.heading)).toEqual(["The Coast", "The Vacuum", "Your Clan", "The Goal"]);
  });

  it("navigates beats without overrunning", () => {
    const s = createIntroStory();
    expect(s.index()).toBe(0);
    s.next(); s.next(); s.next();
    expect(s.atEnd()).toBe(true);
    s.next();
    expect(s.index()).toBe(3);
    s.back();
    expect(s.index()).toBe(2);
    s.reset();
    expect(s.index()).toBe(0);
  });

  it("tracks skip", () => {
    const s = createIntroStory();
    expect(s.skipped()).toBe(false);
    s.skip();
    expect(s.skipped()).toBe(true);
  });

  it("panel advances and begins at the end", () => {
    const onBegin = vi.fn();
    const onSkip = vi.fn();
    const el = introStoryPanel({ onBegin, onSkip, onClose: () => {} });
    const next = el.querySelector('[data-testid="intro-next"]') as HTMLButtonElement;
    expect(el.querySelector('[data-testid="intro-heading"]')?.textContent).toBe("The Coast");
    next.click(); next.click(); next.click();
    expect(el.querySelector('[data-testid="intro-heading"]')?.textContent).toBe("The Goal");
    expect(next.textContent).toBe("Begin the campaign");
    next.click();
    expect(onBegin).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("panel skip fires onSkip", () => {
    const onBegin = vi.fn();
    const onSkip = vi.fn();
    const el = introStoryPanel({ onBegin, onSkip, onClose: () => {} });
    (el.querySelector('[data-testid="intro-skip"]') as HTMLButtonElement).click();
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onBegin).not.toHaveBeenCalled();
  });
});
