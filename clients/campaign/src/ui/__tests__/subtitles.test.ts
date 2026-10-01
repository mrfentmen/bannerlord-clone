/**
 * MASTER_PLAN task 21: the subtitle bar shows/hides lines, reflects the
 * subtitle size/background settings live, and announces via ARIA.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createSubtitleBar } from "../subtitles.js";
import { settings } from "../../settings/index.js";

describe("subtitle bar (task 21)", () => {
  beforeEach(() => {
    settings.set({
      subtitleSize: "medium",
      subtitleBackground: "translucent",
    });
    document.body.innerHTML = "";
  });

  it("is hidden until a line shows", () => {
    const bar = createSubtitleBar();
    document.body.appendChild(bar.root);
    expect(bar.root.hidden).toBe(true);
    bar.show("Marcus", "We ride at dawn.");
    expect(bar.root.hidden).toBe(false);
    expect(bar.root.textContent).toContain("Marcus");
    expect(bar.root.textContent).toContain("We ride at dawn.");
    bar.hide();
    expect(bar.root.hidden).toBe(true);
    bar.destroy();
  });

  it("announces lines politely to screen readers", () => {
    const bar = createSubtitleBar();
    expect(bar.root.getAttribute("role")).toBe("status");
    expect(bar.root.getAttribute("aria-live")).toBe("polite");
    bar.destroy();
  });

  it("applies the configured size and background classes", () => {
    const bar = createSubtitleBar();
    document.body.appendChild(bar.root);
    expect(bar.root.classList.contains("subtitles--medium")).toBe(true);
    expect(bar.root.classList.contains("subtitles--bg-translucent")).toBe(true);
    settings.set({ subtitleSize: "large", subtitleBackground: "solid" });
    expect(bar.root.classList.contains("subtitles--large")).toBe(true);
    expect(bar.root.classList.contains("subtitles--bg-solid")).toBe(true);
    expect(bar.root.classList.contains("subtitles--medium")).toBe(false);
    bar.destroy();
  });

  it("supports background off (text shadow only)", () => {
    settings.set({ subtitleBackground: "off" });
    const bar = createSubtitleBar();
    document.body.appendChild(bar.root);
    expect(bar.root.classList.contains("subtitles--bg-off")).toBe(true);
    bar.destroy();
  });
});
